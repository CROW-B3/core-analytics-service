import type { Environment } from './types';
import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, max, min, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { logger } from 'hono/logger';
import * as schema from './db/schema';
import {
  CreateEventRoute,
  GetEventsQueryRoute,
  GetEventsRoute,
  GetOverviewRoute,
  GetSessionsRoute,
  GetSummaryRoute,
  HealthRoute,
} from './routes/analytics';

const app = new OpenAPIHono<{ Bindings: Environment }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Bad Request', message: 'Invalid request parameters' },
        400
      );
    }
  },
});
app.use(logger());

// Fail-closed: if INTERNAL_GATEWAY_KEY is not provisioned, reject all API requests
app.use('/api/v1/*', async (c, next) => {
  if (!c.env.INTERNAL_GATEWAY_KEY) {
    return c.json({ error: 'Service misconfigured' }, 503);
  }
  const internalKey = c.req.header('X-Internal-Key');
  if (!internalKey || internalKey !== c.env.INTERNAL_GATEWAY_KEY) {
    return c.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      401
    );
  }
  return next();
});

// Sanitize validation errors — never leak ZodError schema details
app.onError((err, c) => {
  const errorName = err instanceof Error ? err.name : '';
  const errorMessage = err instanceof Error ? err.message : '';
  const isClientError =
    errorName === 'ZodError' ||
    errorName === 'SyntaxError' ||
    errorMessage.includes('Unexpected end of JSON') ||
    errorMessage.includes('Unexpected token') ||
    errorMessage.includes('Malformed JSON');
  if (isClientError) {
    return c.json(
      { error: 'Bad Request', message: 'Invalid request parameters' },
      400
    );
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.openapi(HealthRoute, c => c.json({ status: 'ok' }, 200));

// ---------------------------------------------------------------------------
// Client-facing convenience endpoints — organizationId as query param
// ---------------------------------------------------------------------------

app.openapi(GetOverviewRoute, async c => {
  const { organizationId } = c.req.valid('query');
  const callerOrgId = c.req.header('X-Organization-Id');

  if (!callerOrgId || callerOrgId !== organizationId) {
    return c.json(
      { error: 'Forbidden', message: 'Access denied to this organization' },
      403
    ) as never;
  }

  const db = drizzle(c.env.DB, { schema });

  const [byTypeRows, bySourceRows, totalResult] = await Promise.all([
    db
      .select({ eventType: schema.analyticsEvent.eventType, count: count() })
      .from(schema.analyticsEvent)
      .where(eq(schema.analyticsEvent.organizationId, organizationId))
      .groupBy(schema.analyticsEvent.eventType),
    db
      .select({ source: schema.analyticsEvent.source, count: count() })
      .from(schema.analyticsEvent)
      .where(eq(schema.analyticsEvent.organizationId, organizationId))
      .groupBy(schema.analyticsEvent.source),
    db
      .select({ count: count() })
      .from(schema.analyticsEvent)
      .where(eq(schema.analyticsEvent.organizationId, organizationId)),
  ]);

  const byType: Record<string, number> = {};
  for (const row of byTypeRows) {
    byType[row.eventType] = row.count ?? 0;
  }

  const bySource: Record<string, number> = {};
  for (const row of bySourceRows) {
    if (row.source != null) {
      bySource[row.source] = row.count ?? 0;
    }
  }

  return c.json(
    {
      total: totalResult[0]?.count ?? 0,
      byType,
      bySource,
    },
    200
  );
});

app.openapi(GetEventsQueryRoute, async c => {
  const {
    organizationId,
    limit: limitStr,
    offset: offsetStr,
    eventType,
    source,
  } = c.req.valid('query');
  const callerOrgId = c.req.header('X-Organization-Id');

  if (!callerOrgId || callerOrgId !== organizationId) {
    return c.json(
      { error: 'Forbidden', message: 'Access denied to this organization' },
      403
    ) as never;
  }

  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(limitStr || '20', 10) || 20)
  );
  const offset = Math.max(0, Number.parseInt(offsetStr || '0', 10) || 0);

  const db = drizzle(c.env.DB, { schema });

  const whereClause = and(
    eq(schema.analyticsEvent.organizationId, organizationId),
    eventType ? eq(schema.analyticsEvent.eventType, eventType) : undefined,
    source ? eq(schema.analyticsEvent.source, source) : undefined
  );

  const [events, countResult] = await Promise.all([
    db
      .select()
      .from(schema.analyticsEvent)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(schema.analyticsEvent.createdAt),
    db
      .select({ count: count() })
      .from(schema.analyticsEvent)
      .where(whereClause),
  ]);

  return c.json(
    {
      events: events.map(e => ({
        id: e.id,
        organizationId: e.organizationId,
        eventType: e.eventType,
        source: e.source,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
      total: countResult[0]?.count ?? 0,
    },
    200
  );
});

app.openapi(GetSessionsRoute, async c => {
  const {
    organizationId,
    limit: limitStr,
    offset: offsetStr,
  } = c.req.valid('query');
  const callerOrgId = c.req.header('X-Organization-Id');

  if (!callerOrgId || callerOrgId !== organizationId) {
    return c.json(
      { error: 'Forbidden', message: 'Access denied to this organization' },
      403
    ) as never;
  }

  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(limitStr || '20', 10) || 20)
  );
  const offset = Math.max(0, Number.parseInt(offsetStr || '0', 10) || 0);

  const db = drizzle(c.env.DB, { schema });

  // Derive sessions by grouping on the `source` field. Each distinct source
  // value represents a logical session (e.g. a web session, SDK session, etc).
  const sessionRows = await db
    .select({
      sessionId: schema.analyticsEvent.source,
      eventCount: count(),
      firstSeen: min(schema.analyticsEvent.createdAt),
      lastSeen: max(schema.analyticsEvent.createdAt),
    })
    .from(schema.analyticsEvent)
    .where(eq(schema.analyticsEvent.organizationId, organizationId))
    .groupBy(schema.analyticsEvent.source)
    .orderBy(sql`max(${schema.analyticsEvent.createdAt}) DESC`);

  const total = sessionRows.length;
  const paginated = sessionRows.slice(offset, offset + limit).map(r => ({
    sessionId: r.sessionId ?? 'unknown',
    eventCount: r.eventCount ?? 0,
    firstSeen: r.firstSeen ?? 0,
    lastSeen: r.lastSeen ?? 0,
  }));

  return c.json({ sessions: paginated, total }, 200);
});

// ---------------------------------------------------------------------------
// Original routes
// ---------------------------------------------------------------------------

app.openapi(CreateEventRoute, async c => {
  const callerOrgId = c.req.header('X-Organization-Id');
  if (!callerOrgId) {
    return c.json(
      { error: 'Unauthorized', message: 'X-Organization-Id header required' },
      401
    ) as never;
  }

  const body = c.req.valid('json');
  const db = drizzle(c.env.DB, { schema });

  const metadataStr =
    body.metadata === undefined
      ? null
      : typeof body.metadata === 'string'
        ? body.metadata
        : JSON.stringify(body.metadata);

  const id = crypto.randomUUID();
  await db.insert(schema.analyticsEvent).values({
    id,
    organizationId: callerOrgId,
    eventType: body.eventType,
    source: body.source ?? null,
    metadata: metadataStr,
    createdAt: Date.now(),
  });

  return c.json({ id, created: true }, 201);
});

app.openapi(GetEventsRoute, async c => {
  const { orgId } = c.req.valid('param');
  const callerOrgId = c.req.header('X-Organization-Id');

  if (!callerOrgId || callerOrgId !== orgId) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Access denied to this organization',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    ) as never;
  }

  const {
    limit: limitStr,
    offset: offsetStr,
    eventType,
    source,
  } = c.req.valid('query');
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(limitStr || '20', 10) || 20)
  );
  const offset = Math.max(0, Number.parseInt(offsetStr || '0', 10) || 0);

  const db = drizzle(c.env.DB, { schema });

  const whereClause = and(
    eq(schema.analyticsEvent.organizationId, orgId),
    eventType ? eq(schema.analyticsEvent.eventType, eventType) : undefined,
    source ? eq(schema.analyticsEvent.source, source) : undefined
  );

  const [events, countResult] = await Promise.all([
    db
      .select()
      .from(schema.analyticsEvent)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(schema.analyticsEvent.createdAt),
    db
      .select({ count: count() })
      .from(schema.analyticsEvent)
      .where(whereClause),
  ]);

  return c.json(
    {
      events: events.map(e => ({
        id: e.id,
        organizationId: e.organizationId,
        eventType: e.eventType,
        source: e.source,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
      total: countResult[0]?.count ?? 0,
    },
    200
  );
});

app.openapi(GetSummaryRoute, async c => {
  const { orgId } = c.req.valid('param');
  const callerOrgId = c.req.header('X-Organization-Id');

  if (!callerOrgId || callerOrgId !== orgId) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Access denied to this organization',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    ) as never;
  }

  const db = drizzle(c.env.DB, { schema });

  const [byTypeRows, bySourceRows, totalResult] = await Promise.all([
    db
      .select({ eventType: schema.analyticsEvent.eventType, count: count() })
      .from(schema.analyticsEvent)
      .where(eq(schema.analyticsEvent.organizationId, orgId))
      .groupBy(schema.analyticsEvent.eventType),
    db
      .select({ source: schema.analyticsEvent.source, count: count() })
      .from(schema.analyticsEvent)
      .where(eq(schema.analyticsEvent.organizationId, orgId))
      .groupBy(schema.analyticsEvent.source),
    db
      .select({ count: count() })
      .from(schema.analyticsEvent)
      .where(eq(schema.analyticsEvent.organizationId, orgId)),
  ]);

  const byType: Record<string, number> = {};
  for (const row of byTypeRows) {
    byType[row.eventType] = row.count ?? 0;
  }

  const bySource: Record<string, number> = {};
  for (const row of bySourceRows) {
    if (row.source != null) {
      bySource[row.source] = row.count ?? 0;
    }
  }

  return c.json(
    {
      total: totalResult[0]?.count ?? 0,
      byType,
      bySource,
    },
    200
  );
});

app.doc('/api/v1/docs', {
  openapi: '3.0.0',
  info: { version: '1.0.0', title: 'CROW Analytics Service API' },
});

export default app;
