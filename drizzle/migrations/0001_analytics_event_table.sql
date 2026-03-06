CREATE TABLE IF NOT EXISTS `analytics_event` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `event_type` text NOT NULL,
  `source` text,
  `metadata` text,
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `analytics_event_org_idx` ON `analytics_event` (`organization_id`);
CREATE INDEX IF NOT EXISTS `analytics_event_type_idx` ON `analytics_event` (`event_type`);
