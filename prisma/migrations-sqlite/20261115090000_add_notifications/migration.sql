-- NOT-001.1 Global notification center: one row per recipient, immutable except read_at. Additive.

CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipient_user_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "scope_type" TEXT NOT NULL,
    "team_id" TEXT,
    "project_id" INTEGER,
    "feature_type" TEXT,
    "file_id" TEXT,
    "type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "group_key" TEXT,
    "link" TEXT,
    "source_event_id" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "read_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_recipient_user_id_fkey"
      FOREIGN KEY ("recipient_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "notifications_actor_user_id_fkey"
      FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- A NULL source_event_id never collides, so only events with an id are deduplicated per recipient.
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_recipient_source_event_key"
ON "notifications"("recipient_user_id", "source_event_id");
CREATE INDEX IF NOT EXISTS "notifications_recipient_unread"
ON "notifications"("recipient_user_id", "read_at", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_recipient_created"
ON "notifications"("recipient_user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_scope_created"
ON "notifications"("team_id", "project_id", "created_at" DESC);
