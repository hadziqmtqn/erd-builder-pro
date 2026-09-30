-- COL-003 contextual Comment tables. Additive for existing installations.

CREATE TABLE IF NOT EXISTS "comment_threads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" INTEGER NOT NULL,
    "team_id" TEXT NOT NULL,
    "feature_type" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "anchor_type" TEXT NOT NULL,
    "anchor_id" TEXT NOT NULL,
    "anchor_label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'resolved')),
    "created_by" TEXT NOT NULL,
    "resolved_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "comment_threads_file_updated"
ON "comment_threads"("team_id", "project_id", "feature_type", "file_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "comment_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "thread_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL CHECK (length(trim("body")) > 0 AND length("body") <= 4000),
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comment_messages_thread_fkey"
      FOREIGN KEY ("thread_id") REFERENCES "comment_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "comment_messages_thread_created"
ON "comment_messages"("thread_id", "created_at");

CREATE TABLE IF NOT EXISTS "comment_reads" (
    "thread_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("thread_id", "user_id"),
    CONSTRAINT "comment_reads_thread_fkey"
      FOREIGN KEY ("thread_id") REFERENCES "comment_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "comment_reads_user_thread"
ON "comment_reads"("user_id", "thread_id");
