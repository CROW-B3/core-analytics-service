import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const analyticsEvent = sqliteTable('analytics_event', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  eventType: text('event_type').notNull(),
  source: text('source'),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
});
