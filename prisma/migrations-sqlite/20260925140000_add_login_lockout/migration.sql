ALTER TABLE "users"
ADD COLUMN "login_failed_attempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "users"
ADD COLUMN "login_locked_until" DATETIME;
