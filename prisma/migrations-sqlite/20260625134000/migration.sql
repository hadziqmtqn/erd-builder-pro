-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN "auto_backup_enabled" BOOLEAN DEFAULT false;
ALTER TABLE "user_preferences" ADD COLUMN "auto_backup_interval" INTEGER DEFAULT 3600;
ALTER TABLE "user_preferences" ADD COLUMN "auto_backup_retention" INTEGER DEFAULT 10;
ALTER TABLE "user_preferences" ADD COLUMN "storage_config" TEXT;
