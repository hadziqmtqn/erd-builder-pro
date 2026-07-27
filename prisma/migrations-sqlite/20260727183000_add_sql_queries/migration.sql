CREATE TABLE "sql_queries" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "uid" TEXT,
  "diagram_id" INTEGER NOT NULL,
  "group_name" TEXT NOT NULL DEFAULT 'Ungrouped',
  "name" TEXT NOT NULL,
  "script" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sql_queries_diagram_id_fkey" FOREIGN KEY ("diagram_id") REFERENCES "diagrams" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "sql_queries_uid_key" ON "sql_queries"("uid");
CREATE INDEX "idx_sql_queries_diagram" ON "sql_queries"("diagram_id");
