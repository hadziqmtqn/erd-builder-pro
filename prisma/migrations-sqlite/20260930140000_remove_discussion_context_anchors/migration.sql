CREATE TABLE "new_discussion_contexts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "thread_id" TEXT NOT NULL,
    "feature_type" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discussion_contexts_thread_fkey"
      FOREIGN KEY ("thread_id") REFERENCES "discussion_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

INSERT INTO "new_discussion_contexts" ("id", "thread_id", "feature_type", "file_id", "created_at")
SELECT "id", "thread_id", "feature_type", "file_id", "created_at"
FROM "discussion_contexts";

DROP TABLE "discussion_contexts";
ALTER TABLE "new_discussion_contexts" RENAME TO "discussion_contexts";

CREATE INDEX IF NOT EXISTS "discussion_contexts_thread"
ON "discussion_contexts"("thread_id");

CREATE INDEX IF NOT EXISTS "discussion_contexts_file"
ON "discussion_contexts"("feature_type", "file_id");
