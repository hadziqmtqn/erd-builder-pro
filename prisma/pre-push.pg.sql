-- Runs before `prisma db push` in docker-entrypoint.sh (BUG-057).
-- Prisma refuses to add a unique constraint to an existing table without --accept-data-loss, so on a database from
-- v3.4.6 or older the push stopped and the first start after an upgrade kept the old schema. users.sso_subject is new
-- and still NULL in every row, so adding it with its unique index here cannot fail or lose data.
-- A new database has no users table yet; prisma db push creates everything there.
DO $$
BEGIN
  IF to_regclass('users') IS NOT NULL THEN
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sso_subject" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "users_sso_subject_key" ON "users"("sso_subject");
  END IF;
END $$;
