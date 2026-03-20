import { createRoute, z } from '@hono/zod-openapi';
import {
  AnalyticsEventListResponseSchema,
  AnalyticsSummarySchema,
  CreateEventBodySchema,
  ErrorSchema,
} from '../types';

// ---------------------------------------------------------------------------
// Client-facing convenience routes (accept organizationId as query param)
// ---------------------------------------------------------------------------

export const GetOverviewRoute = createRoute({
  method: 'get',
  path: '/api/v1/analytics/overview',
  request: {
    query: z.object({
      organizationId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: AnalyticsSummarySchema },
      },
      description: 'Analytics overview (summary) for organization',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Missing organizationId',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Forbidden',
    },
  },
});

export const GetEventsQueryRoute = createRoute({
  method: 'get',
  path: '/api/v1/analytics/events',
  request: {
    query: z.object({
      organizationId: z.string().min(1),
      limit: z
        .string()
        .regex(/^[1-9]\d*$/)
        .optional(),
      offset: z.string().regex(/^\d+$/).optional(),
      eventType: z.string().max(128).optional(),
      source: z.string().max(128).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: AnalyticsEventListResponseSchema },
      },
      description: 'Analytics events for organization',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Missing organizationId',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Forbidden',
    },
  },
});

export const GetSessionsRoute = createRoute({
  method: 'get',
  path: '/api/v1/analytics/sessions',
  request: {
    query: z.object({
      organizationId: z.string().min(1),
      limit: z
        .string()
        .regex(/^[1-9]\d*$/)
        .optional(),
      offset: z.string().regex(/^\d+$/).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            sessions: z.array(
              z.object({
                sessionId: z.string(),
                eventCount: z.number(),
                firstSeen: z.number(),
                lastSeen: z.number(),
              })
            ),
            total: z.number(),
          }),
        },
      },
      description: 'Session summary derived from analytics events',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Missing organizationId',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Forbidden',
    },
  },
});

// ---------------------------------------------------------------------------
// Original routes (kept for backwards compatibility)
// ---------------------------------------------------------------------------

export const CreateEventRoute = createRoute({
  method: 'post',
  path: '/api/v1/analytics/events',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateEventBodySchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: z.object({ id: z.string(), created: z.boolean() }),
        },
      },
      description: 'Event recorded',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Bad request',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized — missing or invalid X-Organization-Id',
    },
  },
});

export const GetEventsRoute = createRoute({
  method: 'get',
  path: '/api/v1/analytics/events/organization/:orgId',
  request: {
    params: z.object({ orgId: z.string() }),
    query: z.object({
      limit: z
        .string()
        .regex(/^[1-9]\d*$/)
        .optional(),
      offset: z.string().regex(/^\d+$/).optional(),
      eventType: z.string().max(128).optional(),
      source: z.string().max(128).optional(),
    }),
    headers: z.object({
      'x-organization-id': z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: AnalyticsEventListResponseSchema },
      },
      description: 'Analytics events for organization',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Forbidden',
    },
  },
});

export const GetSummaryRoute = createRoute({
  method: 'get',
  path: '/api/v1/analytics/summary/organization/:orgId',
  request: {
    params: z.object({ orgId: z.string() }),
    headers: z.object({
      'x-organization-id': z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: AnalyticsSummarySchema },
      },
      description: 'Analytics summary for organization',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Forbidden',
    },
  },
});

export const HealthRoute = createRoute({
  method: 'get',
  path: '/health',
  request: {},
  responses: {
    200: {
      content: {
        'application/json': { schema: z.object({ status: z.string() }) },
      },
      description: 'Health check',
    },
  },
});
