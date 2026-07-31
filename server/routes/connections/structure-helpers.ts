import { quoteIdentifier } from "./record-helpers.js";

type StructureColumnPatch = {
  name?: string;
  type?: string;
  is_nullable?: boolean;
  column_default?: string | null;
  extra?: string | null;
  comment?: string | null;
  enum_values?: string[];
};

type StructurePatch = {
  createTable?: {
    name?: string;
    column?: StructureColumnPatch;
  };
  tableName?: string;
  columnName?: string;
  column?: StructureColumnPatch;
  foreignKey?: {
    enabled?: boolean;
    ref_table?: string;
    ref_column?: string;
  };
  indexName?: string;
  index?: {
    name?: string;
    columns?: string[] | string;
    is_unique?: boolean;
    algorithm?: string | null;
  };
  deleteColumnName?: string;
  deleteIndexName?: string;
  deleteTables?: string[];
  truncateTables?: string[];
  cloneTable?: { source?: string; target?: string; withData?: boolean };
  ignoreForeignKeys?: boolean;
  cascade?: boolean;
};

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const TYPE_RE = /^[A-Za-z][A-Za-z0-9_\s(),.[\]]{0,120}$/;
const EXTRA_RE = /^[A-Za-z0-9_\s(),]*$/;
const INDEX_ALGORITHMS = new Set(["", "btree", "hash"]);
const DEFAULT_FUNCTIONS = new Set(["CURRENT_TIMESTAMP", "CURRENT_DATE", "CURRENT_TIME", "NULL"]);
const COMMON_TYPES = new Set(["int", "integer", "bigint", "smallint", "varchar", "char", "text", "float", "decimal", "numeric", "real", "boolean", "bool", "date", "time", "timestamp", "json"]);
const MYSQL_TYPES = new Set(["tinyint", "mediumint", "tinytext", "mediumtext", "longtext", "binary", "varbinary", "tinyblob", "blob", "mediumblob", "longblob", "double", "year", "datetime", "bit", "enum"]);
const POSTGRES_TYPES = new Set(["int2", "int4", "int8", "serial", "bigserial", "smallserial", "money", "bytea", "uuid", "ulid", "jsonb", "interval", "timestamptz", "timetz", "cidr", "inet", "macaddr", "macaddr8", "tsvector", "tsquery", "character", "character varying", "double precision"]);
const SQLITE_TYPES = new Set(["integer", "text", "real", "blob", "numeric"]);
const LENGTH_TYPES = new Set(["varchar", "char", "character", "character varying", "binary", "varbinary"]);
const PRECISION_TYPES = new Set(["decimal", "numeric"]);
const ENUM_VALUE_RE = /^[^'\\\0]{1,255}$/;

function assertIdentifier(value: string, label: string) {
  if (!IDENTIFIER_RE.test(value || "")) throw new Error(`Invalid ${label}`);
}

function baseColumnType(value: string) {
  return value.toLowerCase().replace(/\(.*/, "").replace(/\s+/g, " ").trim();
}

function assertColumnType(type: string, value: string) {
  if (/^(enum|set)\(/i.test(value)) {
    if (type !== "mysql") throw new Error(`Invalid ${type} column type`);
    parseEnumValues(value).forEach(enumValue => {
      if (!ENUM_VALUE_RE.test(enumValue)) throw new Error("Invalid enum value");
    });
    return;
  }
  if (!TYPE_RE.test(value || "") || /;|--|\/\*/.test(value)) throw new Error("Invalid column type");
  const base = baseColumnType(value);
  const args = value.match(/\(([^)]*)\)/)?.[1];
  if (args && LENGTH_TYPES.has(base)) {
    if (!/^\d+$/.test(args) || Number(args) < 1 || Number(args) > 65535) throw new Error("Invalid column length");
  } else if (args && PRECISION_TYPES.has(base)) {
    const [precision, scale] = args.split(",").map(item => item.trim());
    if (!/^\d+$/.test(precision) || Number(precision) < 1 || Number(precision) > 1000) throw new Error("Invalid numeric precision");
    if (scale !== undefined && (!/^\d+$/.test(scale) || Number(scale) > Number(precision))) throw new Error("Invalid numeric scale");
  } else if (args && type === "postgresql") {
    throw new Error("Invalid column type");
  }
  const allowed = type === "sqlite"
    ? SQLITE_TYPES
    : type === "mysql"
      ? new Set([...COMMON_TYPES, ...MYSQL_TYPES])
      : new Set([...COMMON_TYPES, ...POSTGRES_TYPES]);
  if (!allowed.has(base)) throw new Error(`Invalid ${type} column type`);
}

export function parseEnumValues(value: any) {
  if (Array.isArray(value)) return value.map(String);
  const match = String(value || "").match(/^(?:enum|set)\((.*)\)$/i);
  if (!match) return [];
  return [...match[1].matchAll(/'((?:''|[^'])*)'/g)].map(item => item[1].replace(/''/g, "'"));
}

export function removedEnumValues(column: any, nextValues: any) {
  if (!Array.isArray(nextValues)) return [];
  const next = new Set(nextValues.map(String));
  return parseEnumValues(column?.enum_values).filter(value => !next.has(value));
}

function enumTypeSql(baseType: string, values: string[] | undefined) {
  if (!values || values.length === 0 || !/^(enum|set)\b/i.test(baseType.trim())) return baseType;
  for (const value of values) {
    if (!ENUM_VALUE_RE.test(value)) throw new Error("Invalid enum value");
  }
  const kind = baseType.trim().toLowerCase().startsWith("set") ? "set" : "enum";
  return `${kind}(${values.map(value => `'${value.replace(/'/g, "''")}'`).join(",")})`;
}

function typeWithDefaultModifiers(type: string, value: string) {
  const base = baseColumnType(value);
  if (type === "mysql" && !/\(/.test(value) && (base === "varchar" || base === "varbinary")) {
    return `${value}(255)`;
  }
  return value;
}

function isAutoPrimaryColumn(type: string, columnType: string, extra: any) {
  return type === "mysql"
    ? /\bAUTO_INCREMENT\b/i.test(String(extra || ""))
    : /^(smallserial|serial|bigserial)$/i.test(columnType.trim());
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

function commentSql(type: string, value: any) {
  const text = String(value ?? "").replace(/'/g, "''");
  return type === "mysql" && text ? ` COMMENT '${text}'` : "";
}

function assertColumnExtra(type: string, value: any) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (type !== "mysql") return "";
  if (!EXTRA_RE.test(text) || /;|--|\/\*/.test(text)) throw new Error("Invalid column extra");
  return ` ${text}`;
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
  return String(column?.full_type === "USER-DEFINED" ? column?.type : column?.full_type || column?.type || "");
}

function ddlColumnType(column: any) {
  const typeName = String(column?.full_type || column?.type || "");
  return column?.max_length && /^(character varying|varchar|character|char)$/i.test(typeName)
    ? `${typeName}(${column.max_length})`
    : typeName;
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

function assertTableRenameAllowed(currentTable: string, nextTable: string, schema: any[]) {
  if (nextTable === currentTable) return;
  const children = schema
    .filter((table: any) => table.table_name !== currentTable)
    .filter((table: any) => (table.foreign_keys || []).some((fk: any) => fk.ref_table === currentTable))
    .map((table: any) => table.table_name);
  if (children.length > 0) throw new Error(`Table "${currentTable}" is referenced by child table "${children[0]}" and cannot be renamed`);
}

function addPostgresEnumValuesStatements(type: string, column: any, values: string[] | undefined) {
  if (type !== "postgresql" || !Array.isArray(values) || values.length === 0 || !Array.isArray(column?.enum_values)) return [];
  const current = new Set(parseEnumValues(column.enum_values));
  const enumType = columnType(column);
  assertIdentifier(enumType, "enum type");
  return values
    .filter(value => !current.has(value))
    .map(value => {
      if (!ENUM_VALUE_RE.test(value)) throw new Error("Invalid enum value");
      return `ALTER TYPE ${quoteIdentifier(type, enumType)} ADD VALUE IF NOT EXISTS '${value.replace(/'/g, "''")}'`;
    });
}

function splitColumns(value: string[] | string | undefined) {
  return (Array.isArray(value) ? value : String(value || "").split(",")).map(item => String(item).trim()).filter(Boolean);
}

function assertIndexColumns(value: string[] | string | undefined, tableSchema: any) {
  const columns = splitColumns(value);
  const allowed = new Set((tableSchema.columns || []).map((column: any) => column.name));
  if (columns.length === 0) throw new Error("Index columns are required");
  for (const column of columns) {
    assertIdentifier(column, "index column");
    if (!allowed.has(column)) throw new Error(`Invalid index column: ${column}`);
  }
  return columns;
}

function indexSignature(index: any) {
  return JSON.stringify({
    algorithm: String(index.algorithm || "").toLowerCase(),
    unique: Boolean(index.is_unique),
    columns: splitColumns(index.columns || index.column_name).join(","),
  });
}

function indexSql(type: string, tableNameSql: string, index: NonNullable<StructurePatch["index"]>, tableSchema: any, excludeName = "") {
  const name = String(index.name || "");
  assertIdentifier(name, "index name");
  const columns = assertIndexColumns(index.columns, tableSchema);
  const algorithm = String(index.algorithm || "").toLowerCase();
  if (!INDEX_ALGORITHMS.has(algorithm)) throw new Error("Invalid index algorithm");
  const nextSignature = indexSignature({ ...index, algorithm });
  const duplicate = (tableSchema.indexes || []).find((current: any) =>
    !current.is_primary && current.name !== index.name && current.name !== excludeName && indexSignature(current) === nextSignature);
  if (duplicate) throw new Error(`Duplicate index definition: ${duplicate.name}`);
  const unique = index.is_unique ? "UNIQUE " : "";
  const columnSql = columns.map(column => quoteIdentifier(type, column)).join(", ");
  return type === "postgresql"
    ? `CREATE ${unique}INDEX ${quoteIdentifier(type, name)} ON ${tableNameSql}${algorithm ? ` USING ${algorithm}` : ""} (${columnSql})`
    : `CREATE ${unique}INDEX ${quoteIdentifier(type, name)}${algorithm ? ` USING ${algorithm.toUpperCase()}` : ""} ON ${tableNameSql} (${columnSql})`;
}

export function buildStructureStatements(type: string, tableSchema: any, patch: StructurePatch, schema: any[] = []) {
  if (type !== "postgresql" && type !== "mysql") throw new Error("Structure editing is only supported for PostgreSQL and MySQL catalogs");

  const validTables = (tableNames: string[]) => {
    const tables = [...new Set(tableNames.map(String))];
    for (const table of tables) {
      assertIdentifier(table, "table name");
      if (!schema.some((item: any) => item.table_name === table)) throw new Error(`Invalid table name: ${table}`);
    }
    return tables;
  };

  if (Array.isArray(patch.deleteTables) && patch.deleteTables.length > 0) {
    const tables = validTables(patch.deleteTables);
    const drops = tables.map(table => `DROP TABLE ${quoteIdentifier(type, table)}${type === "postgresql" && patch.cascade ? " CASCADE" : ""}`);
    if (type === "mysql" && patch.ignoreForeignKeys) return ["SET FOREIGN_KEY_CHECKS=0", ...drops, "SET FOREIGN_KEY_CHECKS=1"];
    return drops;
  }
  if (Array.isArray(patch.truncateTables) && patch.truncateTables.length > 0) {
    const tables = validTables(patch.truncateTables);
    const truncates = tables.map(table => `TRUNCATE TABLE ${quoteIdentifier(type, table)}${type === "postgresql" && patch.cascade ? " CASCADE" : ""}`);
    if (type === "mysql" && patch.ignoreForeignKeys) return ["SET FOREIGN_KEY_CHECKS=0", ...truncates, "SET FOREIGN_KEY_CHECKS=1"];
    return truncates;
  }
  if (patch.cloneTable) {
    const source = String(patch.cloneTable.source || "");
    const target = String(patch.cloneTable.target || "");
    validTables([source]);
    assertIdentifier(target, "table name");
    if (schema.some((item: any) => item.table_name === target)) throw new Error("Table already exists");
    const sourceSql = quoteIdentifier(type, source);
    const targetSql = quoteIdentifier(type, target);
    return type === "postgresql"
      ? [`CREATE TABLE ${targetSql} (LIKE ${sourceSql} INCLUDING ALL)`, ...(patch.cloneTable.withData ? [`INSERT INTO ${targetSql} SELECT * FROM ${sourceSql}`] : [])]
      : [`CREATE TABLE ${targetSql} LIKE ${sourceSql}`, ...(patch.cloneTable.withData ? [`INSERT INTO ${targetSql} SELECT * FROM ${sourceSql}`] : [])];
  }

  if (patch.createTable) {
    const tableName = String(patch.createTable.name || "");
    const column = patch.createTable.column || {};
    const columnName = String(column.name || "");
    const rawColumnType = String(column.type || "");
    const columnTypeSql = typeWithDefaultModifiers(type, type === "mysql" ? enumTypeSql(rawColumnType, column.enum_values) : rawColumnType);
    assertIdentifier(tableName, "table name");
    assertIdentifier(columnName, "column name");
    assertColumnType(type, columnTypeSql);
    const nullableClause = column.is_nullable ? "NULL" : "NOT NULL";
    const extraClause = assertColumnExtra(type, column.extra);
    const columnSql = `${quoteIdentifier(type, columnName)} ${columnTypeSql} ${nullableClause}${defaultSql(column.column_default)}${extraClause}${commentSql(type, column.comment)}`;
    const primaryKeySql = isAutoPrimaryColumn(type, columnTypeSql, column.extra)
      ? `, PRIMARY KEY (${quoteIdentifier(type, columnName)})`
      : "";
    const statements = [`CREATE TABLE ${quoteIdentifier(type, tableName)} (${columnSql}${primaryKeySql})`];
    if (type === "postgresql" && column.comment !== undefined) {
      const comment = column.comment ? `'${String(column.comment).replace(/'/g, "''")}'` : "NULL";
      statements.push(`COMMENT ON COLUMN ${quoteIdentifier(type, tableName)}.${quoteIdentifier(type, columnName)} IS ${comment}`);
    }
    return statements;
  }

  const currentTable = String(tableSchema.table_name || "");
  const nextTable = String(patch.tableName || currentTable);
  assertIdentifier(currentTable, "table name");
  assertIdentifier(nextTable, "table name");

  const statements: string[] = [];
  const oldTableSql = tableSql(type, tableSchema.table_schema, currentTable);
  if (patch.deleteColumnName) {
    const columnName = String(patch.deleteColumnName);
    assertIdentifier(columnName, "column name");
    if (!(tableSchema.columns || []).some((column: any) => column.name === columnName)) throw new Error("Invalid column name");
    return [`ALTER TABLE ${oldTableSql} DROP COLUMN ${quoteIdentifier(type, columnName)}`];
  }
  if (nextTable !== currentTable) {
    assertTableRenameAllowed(currentTable, nextTable, schema);
    statements.push(type === "postgresql"
      ? `ALTER TABLE ${oldTableSql} RENAME TO ${quoteIdentifier(type, nextTable)}`
      : `RENAME TABLE ${quoteIdentifier(type, currentTable)} TO ${quoteIdentifier(type, nextTable)}`);
  }

  if (!patch.columnName || !patch.column) return statements;
  const isNewColumn = patch.columnName === "__new__";
  const currentColumn = String(patch.columnName);
  const existingColumn = (tableSchema.columns || []).find((column: any) => column.name === currentColumn);
  if (!isNewColumn && !existingColumn) throw new Error("Invalid column name");

  const nextColumn = String(patch.column.name || (isNewColumn ? "" : currentColumn));
  const rawNextType = String(patch.column.type || existingColumn?.full_type || existingColumn?.type || "");
  const nextType = typeWithDefaultModifiers(type, type === "mysql" ? enumTypeSql(rawNextType, patch.column.enum_values) : rawNextType);
  if (!isNewColumn) assertIdentifier(currentColumn, "column name");
  assertIdentifier(nextColumn, "column name");
  if (!(type === "postgresql" && Array.isArray(existingColumn?.enum_values) && nextType === columnType(existingColumn))) {
    assertColumnType(type, nextType);
  }

  const workingTableSql = tableSql(type, tableSchema.table_schema, nextTable);
  const currentColumnSql = quoteIdentifier(type, currentColumn);
  const nextColumnSql = quoteIdentifier(type, nextColumn);
  const extraClause = assertColumnExtra(type, patch.column.extra);
  const nullableClause = patch.column.is_nullable ? "NULL" : "NOT NULL";

  statements.push(...addPostgresEnumValuesStatements(type, existingColumn, patch.column.enum_values));

  if (isNewColumn) {
    statements.push(`ALTER TABLE ${workingTableSql} ADD COLUMN ${nextColumnSql} ${nextType} ${nullableClause}${defaultSql(patch.column.column_default)}${extraClause}${commentSql(type, patch.column.comment)}`);
  } else if (nextColumn !== currentColumn) {
    statements.push(`ALTER TABLE ${workingTableSql} RENAME COLUMN ${currentColumnSql} TO ${nextColumnSql}`);
  }

  if (!isNewColumn && type === "postgresql") {
    statements.push(`ALTER TABLE ${workingTableSql} ALTER COLUMN ${nextColumnSql} DROP DEFAULT`);
    statements.push(`ALTER TABLE ${workingTableSql} ALTER COLUMN ${nextColumnSql} TYPE ${nextType} USING ${nextColumnSql}::${nextType}`);
    statements.push(`ALTER TABLE ${workingTableSql} ALTER COLUMN ${nextColumnSql} ${patch.column.is_nullable ? "DROP" : "SET"} NOT NULL`);
    const defaultClause = defaultSql(patch.column.column_default).trim();
    if (defaultClause) statements.push(`ALTER TABLE ${workingTableSql} ALTER COLUMN ${nextColumnSql} SET ${defaultClause}`);
  } else if (!isNewColumn) {
    statements.push(`ALTER TABLE ${workingTableSql} MODIFY COLUMN ${nextColumnSql} ${nextType} ${nullableClause}${defaultSql(patch.column.column_default)}${extraClause}${commentSql(type, patch.column.comment)}`);
  }
  if (type === "postgresql" && patch.column.comment !== undefined) {
    const comment = patch.column.comment ? `'${String(patch.column.comment).replace(/'/g, "''")}'` : "NULL";
    statements.push(`COMMENT ON COLUMN ${workingTableSql}.${nextColumnSql} IS ${comment}`);
  }

  const oldFk = (tableSchema.foreign_keys || []).find((fk: any) => fk.column === currentColumn);
  if (!isNewColumn && oldFk?.constraint_name) {
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

export function buildIndexStatements(type: string, tableSchema: any, patch: StructurePatch) {
  if (type !== "postgresql" && type !== "mysql") throw new Error("Structure editing is only supported for PostgreSQL and MySQL catalogs");
  const currentTable = String(tableSchema.table_name || "");
  assertIdentifier(currentTable, "table name");
  const tableNameSql = tableSql(type, tableSchema.table_schema, currentTable);
  const statements: string[] = [];
  if (patch.deleteIndexName) {
    const indexName = String(patch.deleteIndexName);
    assertIdentifier(indexName, "index name");
    const current = (tableSchema.indexes || []).find((index: any) => index.name === indexName);
    if (!current || current.is_primary) throw new Error("Invalid index name");
    return [type === "postgresql"
      ? `DROP INDEX ${tableSchema.table_schema ? `${quoteIdentifier(type, tableSchema.table_schema)}.` : ""}${quoteIdentifier(type, indexName)}`
      : `DROP INDEX ${quoteIdentifier(type, indexName)} ON ${tableNameSql}`];
  }
  if (!patch.index) return [];
  if (patch.indexName && patch.indexName !== "__new__") {
    assertIdentifier(patch.indexName, "index name");
    const current = (tableSchema.indexes || []).find((index: any) => index.name === patch.indexName);
    if (!current || current.is_primary) throw new Error("Invalid index name");
    statements.push(type === "postgresql"
      ? `DROP INDEX ${tableSchema.table_schema ? `${quoteIdentifier(type, tableSchema.table_schema)}.` : ""}${quoteIdentifier(type, patch.indexName)}`
      : `DROP INDEX ${quoteIdentifier(type, patch.indexName)} ON ${tableNameSql}`);
  }
  statements.push(indexSql(type, tableNameSql, patch.index, tableSchema, patch.indexName));
  return statements;
}

export function buildCreateTableSql(type: string, tableSchema: any) {
  const tableName = String(tableSchema.table_name || "");
  assertIdentifier(tableName, "table name");
  const lines = (tableSchema.columns || []).map((column: any) => {
    const name = quoteIdentifier(type, column.name);
    const typeName = ddlColumnType(column);
    const nullable = column.is_nullable ? "" : " NOT NULL";
    const defaultValue = defaultSql(column.column_default);
    return `  ${name} ${typeName}${nullable}${defaultValue}${commentSql(type, column.comment)}`;
  });
  const pkColumns = (tableSchema.columns || []).filter((column: any) => column.is_pk).map((column: any) => quoteIdentifier(type, column.name));
  if (pkColumns.length) lines.push(`  PRIMARY KEY (${pkColumns.join(", ")})`);
  if (type === "mysql") {
    for (const index of tableSchema.indexes || []) {
      if (index.is_primary) continue;
      const columns = splitColumns(index.column_name).map(column => quoteIdentifier(type, column)).join(", ");
      if (columns) lines.push(`  ${index.is_unique ? "UNIQUE " : ""}KEY ${quoteIdentifier(type, index.name)} (${columns})`);
    }
  }
  const createTable = `CREATE TABLE ${tableSql(type, tableSchema.table_schema, tableName)} (\n${lines.join(",\n")}\n);`;
  const indexes = type === "postgresql"
    ? (tableSchema.indexes || [])
      .filter((index: any) => !index.is_primary)
      .map((index: any) => `${indexSql(type, tableSql(type, tableSchema.table_schema, tableName), {
        name: index.name,
        columns: splitColumns(index.column_name),
        is_unique: index.is_unique,
        algorithm: index.algorithm,
      }, tableSchema)};`)
    : [];
  return [createTable, ...indexes].join("\n\n");
}
