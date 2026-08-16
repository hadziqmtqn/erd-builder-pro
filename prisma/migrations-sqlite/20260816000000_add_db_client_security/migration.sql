ALTER TABLE "db_accounts" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'development';
ALTER TABLE "db_accounts" ADD COLUMN "safe_mode" TEXT NOT NULL DEFAULT 'protected';
ALTER TABLE "db_accounts" ADD COLUMN "ssl_mode" TEXT NOT NULL DEFAULT 'disable';
ALTER TABLE "db_accounts" ADD COLUMN "ssl_ca" TEXT;
ALTER TABLE "db_accounts" ADD COLUMN "ssl_cert" TEXT;
ALTER TABLE "db_accounts" ADD COLUMN "ssl_key" TEXT;
ALTER TABLE "db_accounts" ADD COLUMN "query_timeout_ms" INTEGER NOT NULL DEFAULT 30000;
