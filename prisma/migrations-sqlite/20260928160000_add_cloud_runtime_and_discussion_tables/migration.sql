-- Cloud AI runtime tables and project Discussion tables.
-- IF NOT EXISTS keeps this additive migration safe for databases where the
-- previous startup fallback already created the tables.

CREATE TABLE IF NOT EXISTS "cloud_ai_runtime_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revision" INTEGER NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TEXT,
    "received_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "last_error_code" TEXT
);

CREATE TABLE IF NOT EXISTS "cloud_ai_usage_periods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "team_id" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT,
    "limit_credits" INTEGER NOT NULL,
    "consumed_credits" INTEGER NOT NULL DEFAULT 0,
    "reserved_credits" INTEGER NOT NULL DEFAULT 0,
    "entitlement_revision" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "cloud_ai_usage_period_team_start"
ON "cloud_ai_usage_periods"("team_id", "period_start");

CREATE TABLE IF NOT EXISTS "cloud_ai_usage_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "request_id" TEXT NOT NULL UNIQUE,
    "team_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL,
    "provider_code" TEXT,
    "model_identifier" TEXT,
    "error_code" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "cloud_ai_usage_requests_team_created"
ON "cloud_ai_usage_requests"("team_id", "created_at");

CREATE TABLE IF NOT EXISTS "discussion_threads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" INTEGER,
    "team_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'resolved')),
    "created_by" TEXT NOT NULL,
    "resolved_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "discussion_threads_project_updated"
ON "discussion_threads"("team_id", "project_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "discussion_contexts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "thread_id" TEXT NOT NULL,
    "feature_type" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "anchor_type" TEXT NOT NULL CHECK ("anchor_type" IN ('general', 'table', 'relationship')),
    "anchor_id" TEXT,
    "anchor_label" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discussion_contexts_thread_fkey"
      FOREIGN KEY ("thread_id") REFERENCES "discussion_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "discussion_contexts_thread"
ON "discussion_contexts"("thread_id");

CREATE INDEX IF NOT EXISTS "discussion_contexts_file"
ON "discussion_contexts"("feature_type", "file_id");

CREATE TABLE IF NOT EXISTS "discussion_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "thread_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL CHECK (length(trim("body")) > 0 AND length("body") <= 4000),
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discussion_messages_thread_fkey"
      FOREIGN KEY ("thread_id") REFERENCES "discussion_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "discussion_messages_thread_created"
ON "discussion_messages"("thread_id", "created_at");

CREATE TABLE IF NOT EXISTS "discussion_reads" (
    "thread_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("thread_id", "user_id"),
    CONSTRAINT "discussion_reads_thread_fkey"
      FOREIGN KEY ("thread_id") REFERENCES "discussion_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "discussion_reads_user_thread"
ON "discussion_reads"("user_id", "thread_id");
