ALTER TABLE "discussion_contexts"
  DROP COLUMN IF EXISTS "anchor_type",
  DROP COLUMN IF EXISTS "anchor_id",
  DROP COLUMN IF EXISTS "anchor_label";
