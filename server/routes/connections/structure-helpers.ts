import { quoteIdentifier } from "./record-helpers.js";

type StructurePatch = {
  tableName?: string;
  columnName?: string;
  column?: {
    name?: string;
    type?: string;
    is_nullable?: boolean;
    column_default?: string | null;
  };
  foreignKey?: {
    enabled?: boolean;
    ref_table?: string;
    ref_column?: string;
  };
};

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const TYPE_RE = /^[A-Za-z][A-Za-z0-9_\s(),.[\]]{0,120}$/;
const DEFAULT_FUNCTIONS = new Set(["CURRENT_TIMESTAMP", "CURRENT_DATE", "CURRENT_TIME", "NULL"]);

function assertIdentifier(value: string, label: string) {
  if (!IDENTIFIER_RE.test(value || "")) throw new Error(`Invalid ${label}`);
}

function assertColumnType(value: string) {
  if (!TYPE_RE.test(value || "") || /;|--|\/\*/.test(value)) throw new Error("Invalid column type");
}

function defaultSql(value: any) {
  if (value === undefined || value === "") return "";
  if (value === null || String(value).toUpperCase() === "NULL") return " DEFAULT NULL";
  const text = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return ` DEFAULT ${text}`;
  if (/^(true|false)$/i.test(text)) return ` DEFAULT ${text.toUpperCase()}`;
  if (DEFAULT_FUNCTIONS.has(text.toUpperCase())) return ` DEFAULT ${text.toUpperCase()}`;
  return ` DEFAULT '${text.replace(/'/g, "''")}'`;
}

function constraintName(table: string, column: string) {
  return `fk_${table}_${column}`.replace(/[^A-Za-z0-9_$]/g, "_").slice(0, 60);
}

function tableSql(type: string, schema: string | undefined, table: string) {
  return type === "postgresql" && schema
    ? `${quoteIdentifier(type, schema)}.${quoteIdentifier(type, table)}`
    : quoteIdentifier(type, table);
}

function columnType(column: any) {
  return String(column?.full_type || column?.type || "");
}

function normalizeType(value: string) {
  return value
    .toLowerCase()
    .replace(/[`"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^int4$/, "integer")
    .replace(/^int8$/, "bigint")
    .replace(/^int2$/, "smallint")
    .replace(/^serial$/, "integer")
    .replace(/^bigserial$/, "bigint")
    .replace(/^smallserial$/, "smallint")
    .replace(/^character varying/, "varchar")
    .trim();
}

function assertCompatibleType(sourceType: string, refColumn: any) {
  if (normalizeType(sourceType) !== normalizeType(columnType(refColumn))) {
    throw new Error("Foreign key column type must match the referenced column type");
  }
}

export function buildStructureStatements(type: string, tableSchema: any, patch: StructurePatch, schema: any[] = []) {
  if (type !== "postgresql" && type !== "mysql") throw new Error("Structure editing is only supported for PostgreSQL and MySQL catalogs");

  const currentTable = String(tableSchema.table_name || "");
  const nextTable = String(patch.tableName || currentTable);
  assertIdentifier(currentTable, "table name");
  assertIdentifier(nextTable, "table name");

  const statements: string[] = [];
  const oldTableSql = tableSql(type, tableSchema.table_schema, currentTable);
  if (nextTable !== currentTable) {
    statements.push(type === "postgresql"
      ? `ALTER TABLE ${oldTableSql} RENAME TO ${quoteIdentifier(type, nextTable)}`
      : `RENAME TABLE ${quoteIdentifier(type, currentTable)} TO ${quoteIdentifier(type, nextTable)}`);
  }

  if (!patch.columnName || !patch.column) return statements;
  const currentColumn = String(patch.columnName);
  const existingColumn = (tableSchema.columns || []).find((column: any) => column.name === currentColumn);
  if (!existingColumn) throw new Error("Invalid column name");

  const nextColumn = String(patch.column.name || currentColumn);
  const nextType = String(patch.column.type || existingColumn.full_type || existingColumn.type || "");
  assertIdentifier(currentColumn, "column name");
  assertIdentifier(nextColumn, "column name");
  assertColumnType(nextType);

  const workingTableSql = tableSql(type, tableSchema.table_schema, nextTable);
  const currentColumnSql = quoteIdentifier(type, currentColumn);
  const nextColumnSql = quoteIdentifier(type, nextColumn);
  if (nextColumn !== currentColumn) {
    statements.push(`ALTER TABLE ${workingTableSql} RENAME COLUMN ${currentColumnSql} TO ${nextColumnSql}`);
  }

  if (type === "postgresql") {
    statements.push(`ALTER TABLE ${workingTableSql} ALTER COLUMN ${nextColumnSql} TYPE ${nextType}`);
    statements.push(`ALTER TABLE ${workingTableSql} ALTER COLUMN ${nextColumnSql} ${patch.column.is_nullable ? "DROP" : "SET"} NOT NULL`);
    statements.push(`ALTER TABLE ${workingTableSql} ALTER COLUMN ${nextColumnSql} DROP DEFAULT`);
    const defaultClause = defaultSql(patch.column.column_default).trim();
    if (defaultClause) statements.push(`ALTER TABLE ${workingTableSql} ALTER COLUMN ${nextColumnSql} SET ${defaultClause}`);
  } else {
    statements.push(`ALTER TABLE ${workingTableSql} MODIFY COLUMN ${nextColumnSql} ${nextType} ${patch.column.is_nullable ? "NULL" : "NOT NULL"}${defaultSql(patch.column.column_default)}`);
  }

  const oldFk = (tableSchema.foreign_keys || []).find((fk: any) => fk.column === currentColumn);
  if (oldFk?.constraint_name) {
    statements.push(type === "postgresql"
      ? `ALTER TABLE ${workingTableSql} DROP CONSTRAINT IF EXISTS ${quoteIdentifier(type, oldFk.constraint_name)}`
      : `ALTER TABLE ${workingTableSql} DROP FOREIGN KEY ${quoteIdentifier(type, oldFk.constraint_name)}`);
  }
  if (patch.foreignKey?.enabled) {
    const refTable = String(patch.foreignKey.ref_table || "");
    const refColumn = String(patch.foreignKey.ref_column || "");
    assertIdentifier(refTable, "referenced table");
    assertIdentifier(refColumn, "referenced column");
    const refTableSchema = schema.find((item: any) => item.table_name === refTable);
    const refColumnSchema = refTableSchema?.columns?.find((column: any) => column.name === refColumn);
    if (schema.length > 0 && !refColumnSchema) throw new Error("Invalid referenced column");
    if (refColumnSchema) assertCompatibleType(nextType, refColumnSchema);
    statements.push(`ALTER TABLE ${workingTableSql} ADD CONSTRAINT ${quoteIdentifier(type, constraintName(nextTable, nextColumn))} FOREIGN KEY (${nextColumnSql}) REFERENCES ${quoteIdentifier(type, refTable)} (${quoteIdentifier(type, refColumn)})`);
  }

  return statements;
}
