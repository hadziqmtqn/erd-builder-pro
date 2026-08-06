ALTER TABLE "columns" ADD COLUMN "default_value" TEXT;
ALTER TABLE "columns" ADD COLUMN "is_unique" BOOLEAN DEFAULT false;
ALTER TABLE "entities" ADD COLUMN "comment" TEXT;
ALTER TABLE "relationships" ADD COLUMN "on_delete" TEXT;
ALTER TABLE "relationships" ADD COLUMN "on_update" TEXT;
ALTER TABLE "relationships" ADD COLUMN "constraint_name" TEXT;

CREATE TABLE "table_constraints" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entity_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT,
  "column_ids" TEXT,
  "expression" TEXT,
  "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "table_constraints_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "idx_table_constraints_entity" ON "table_constraints"("entity_id");

CREATE TABLE "table_indexes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entity_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "column_ids" TEXT NOT NULL,
  "is_unique" BOOLEAN DEFAULT false,
  "algorithm" TEXT,
  "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "table_indexes_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "idx_table_indexes_entity" ON "table_indexes"("entity_id");
