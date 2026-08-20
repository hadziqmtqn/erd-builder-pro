CREATE TABLE "db_clients" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "uid" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" INTEGER,
  "catalog_id" INTEGER,
  "legacy_diagram_id" INTEGER,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "_version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "db_clients_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "db_clients_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "db_catalogs" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "db_clients_uid_key" ON "db_clients"("uid");
CREATE UNIQUE INDEX "db_clients_legacy_diagram_id_key" ON "db_clients"("legacy_diagram_id");
CREATE INDEX "idx_db_clients_user_deleted" ON "db_clients"("user_id", "is_deleted");
CREATE INDEX "idx_db_clients_project_deleted" ON "db_clients"("project_id", "is_deleted");
CREATE INDEX "idx_db_clients_catalog" ON "db_clients"("catalog_id");

CREATE TABLE "db_client_layouts" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "db_client_id" INTEGER NOT NULL,
  "data" TEXT NOT NULL DEFAULT '{"nodes":{},"viewport":{"x":0,"y":0,"zoom":1}}',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "db_client_layouts_client_id_fkey" FOREIGN KEY ("db_client_id") REFERENCES "db_clients" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "db_client_layouts_db_client_id_key" ON "db_client_layouts"("db_client_id");

CREATE TABLE "db_client_queries" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "uid" TEXT NOT NULL,
  "db_client_id" INTEGER NOT NULL,
  "legacy_query_id" INTEGER,
  "group_name" TEXT NOT NULL DEFAULT 'Ungrouped',
  "name" TEXT NOT NULL,
  "script" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "db_client_queries_client_id_fkey" FOREIGN KEY ("db_client_id") REFERENCES "db_clients" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "db_client_queries_uid_key" ON "db_client_queries"("uid");
CREATE UNIQUE INDEX "db_client_queries_legacy_query_id_key" ON "db_client_queries"("legacy_query_id");
CREATE INDEX "idx_db_client_queries_client" ON "db_client_queries"("db_client_id");
