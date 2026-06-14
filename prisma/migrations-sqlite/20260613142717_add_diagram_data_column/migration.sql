-- AlterTable
ALTER TABLE "diagrams" ADD COLUMN "data" TEXT;
ALTER TABLE "diagrams" ADD COLUMN "source_connection_id" INTEGER;
ALTER TABLE "diagrams" ADD COLUMN "source_type" TEXT DEFAULT 'blank';

-- CreateTable
CREATE TABLE "db_accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "host" TEXT,
    "port" INTEGER,
    "user" TEXT,
    "password" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "db_catalogs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "database_name" TEXT NOT NULL,
    "label" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "db_catalogs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "db_accounts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user_ai_configs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "provider_id" INTEGER,
    "selected_model_id" INTEGER,
    "api_key" TEXT,
    "is_enabled" BOOLEAN DEFAULT true,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_ai_configs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "user_ai_configs_selected_model_id_fkey" FOREIGN KEY ("selected_model_id") REFERENCES "ai_models" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "user_ai_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
INSERT INTO "new_user_ai_configs" ("api_key", "id", "is_enabled", "provider_id", "selected_model_id", "updated_at", "user_id") SELECT "api_key", "id", "is_enabled", "provider_id", "selected_model_id", "updated_at", "user_id" FROM "user_ai_configs";
DROP TABLE "user_ai_configs";
ALTER TABLE "new_user_ai_configs" RENAME TO "user_ai_configs";
CREATE UNIQUE INDEX "user_ai_configs_user_id_provider_id_key" ON "user_ai_configs"("user_id", "provider_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "idx_db_accounts_user" ON "db_accounts"("user_id");

-- CreateIndex
CREATE INDEX "idx_db_catalogs_account" ON "db_catalogs"("account_id");
