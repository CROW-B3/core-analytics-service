import { z } from '@hono/zod-openapi';

export interface Environment {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  INTERNAL_GATEWAY_KEY?: string;
  ENVIRONMENT: string;
}

export const AnalyticsEventSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    eventType: z.string(),
    source: z.string().nullable(),
    metadata: z.string().nullable(),
    createdAt: z.number(),
  })
  .openapi('AnalyticsEvent');

export const AnalyticsEventListResponseSchema = z
  .object({
    events: z.array(AnalyticsEventSchema),
    total: z.number(),
  })
  .openapi('AnalyticsEventListResponse');

export const AnalyticsSummarySchema = z
  .object({
    total: z.number(),
    byType: z.record(z.string(), z.number()),
    bySource: z.record(z.string(), z.number()),
  })
  .openapi('AnalyticsSummary');

export const CreateEventBodySchema = z
  .object({
    eventType: z.string().min(1).max(128),
    source: z.string().max(128).optional(),
    metadata: z
      .union([z.string().max(65536), z.record(z.string(), z.unknown())])
      .optional(),
  })
  .openapi('CreateEventBody');

export const ErrorSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .openapi('Error');

export const HelloWorldSchema = z
  .object({
    status: z.string(),
  })
  .openapi('HelloWorld');
