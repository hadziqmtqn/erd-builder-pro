type RecordFilterInput = {
  enabled?: boolean;
  column?: string;
  operator?: string;
  value?: string;
  value2?: string;
};

type RecordSortInput = {
  column?: string;
  direction?: string;
};

type TableInfo = {
  dataSize: number | null;
  indexSize: number | null;
  totalSize: number | null;
};

const INTEGER_TYPES = new Set(["smallint", "integer", "int", "bigint", "serial", "bigserial", "smallserial", "tinyint", "mediumint"]);
const NUMERIC_TYPES = new Set(["decimal", "numeric", "real", "double precision", "double", "float", "money"]);
const DECIMAL_TYPES = new Set(["decimal", "numeric"]);
const DATE_TYPES = new Set(["date"]);
const TIME_TYPES = new Set(["time", "time without time zone", "time with time zone"]);
const DATETIME_TYPES = new Set(["timestamp", "timestamp without time zone", "timestamp with time zone", "datetime"]);

export function quoteIdentifier(type: string, name: string) {
  return type === "mysql" ? `\`${name.replace(/`/g, "``")}\`` : `"${name.replace(/"/g, '""')}"`;
}

function quoteSqliteValue(value: string) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function splitList(value = "") {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function parseMySqlEnumValues(columnType: any) {
  if (Array.isArray(columnType)) return columnType.map(String);
  const match = String(columnType || "").match(/^(?:enum|set)\((.*)\)$/i);
  if (!match) return [];
  return [...match[1].matchAll(/'((?:''|[^'])*)'/g)].map(item => item[1].replace(/''/g, "'"));
}

function isBooleanColumn(type: string, column: any) {
  const columnType = String(column.type || "").toLowerCase();
  const fullType = String(column.full_type || column.enum_values || "").toLowerCase();
  return columnType === "boolean" || columnType === "bool" || (type === "mysql" && /^tinyint\(1\)/.test(fullType));
}

function isValidDateText(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]);
}

function isValidTimeText(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,6})?)?$/.test(value);
}

function isValidDateTimeText(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T]((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?)([+-]\d{2}:?\d{2}|Z)?$/);
  return !!match && isValidDateText(match[1]) && isValidTimeText(match[2]);
}

export function validateRecordValues(type: string, values: Record<string, any>, columnByName: Map<string, any>) {
  const normalized: Record<string, any> = {};
  for (const [columnName, value] of Object.entries(values)) {
    const column = columnByName.get(columnName);
    if (!column) throw new Error(`Invalid update column: ${columnName}`);
    if (column.is_pk) throw new Error(`Primary key column cannot be updated: ${columnName}`);
    if (column.is_generated) throw new Error(`Generated column cannot be updated: ${columnName}`);
    if ((value === null || value === undefined) && !column.is_nullable) throw new Error(`Column cannot be null: ${columnName}`);
    if (value === null || value === undefined) {
      normalized[columnName] = null;
      continue;
    }

    const columnType = String(column.type || "").toLowerCase();
    const fullType = String(column.full_type || column.enum_values || "").toLowerCase();
    if (isBooleanColumn(type, column)) {
      if (value !== 0 && value !== 1) throw new Error(`Boolean column must be 0 or 1: ${columnName}`);
      normalized[columnName] = type === "postgresql" ? value === 1 : value;
      continue;
    }

    const enumValues = Array.isArray(column.enum_values) ? column.enum_values : parseMySqlEnumValues(column.enum_values);
    if (enumValues.length) {
      const values = columnType === "set" ? String(value).split(",").filter(Boolean) : [String(value)];
      if (values.some(item => !enumValues.includes(item))) throw new Error(`Invalid enum value for ${columnName}`);
    }

    if (typeof value === "string" && column.max_length && value.length > Number(column.max_length)) {
      throw new Error(`Value too long for ${columnName}; max ${column.max_length} characters`);
    }
    if (INTEGER_TYPES.has(columnType) && (typeof value !== "number" || !Number.isInteger(value))) {
      throw new Error(`Column must be an integer: ${columnName}`);
    }
    if (NUMERIC_TYPES.has(columnType) && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`Column must be numeric: ${columnName}`);
    }
    if (DECIMAL_TYPES.has(columnType) && column.numeric_precision) {
      const [whole, fraction = ""] = String(Math.abs(value)).split(".");
      if (whole.replace(/^0+/, "").length + fraction.length > Number(column.numeric_precision)) {
        throw new Error(`Value exceeds numeric precision for ${columnName}`);
      }
      if (column.numeric_scale !== null && column.numeric_scale !== undefined && fraction.length > Number(column.numeric_scale)) {
        throw new Error(`Value exceeds numeric scale for ${columnName}`);
      }
    }
    if (type === "mysql" && INTEGER_TYPES.has(columnType) && fullType.includes("unsigned") && value < 0) {
      throw new Error(`Column must be unsigned: ${columnName}`);
    }
    if (DATE_TYPES.has(columnType) && !isValidDateText(String(value))) {
      throw new Error(`Column must be a date in YYYY-MM-DD format: ${columnName}`);
    }
    if (TIME_TYPES.has(columnType) && !isValidTimeText(String(value))) {
      throw new Error(`Column must be a time in HH:MM[:SS] format: ${columnName}`);
    }
    if (DATETIME_TYPES.has(columnType) && !isValidDateTimeText(String(value))) {
      throw new Error(`Column must be a timestamp/datetime value: ${columnName}`);
    }
    if ((columnType === "json" || columnType === "jsonb") && typeof value === "string") {
      try { JSON.parse(value); } catch { throw new Error(`Column must contain valid JSON: ${columnName}`); }
    }
    normalized[columnName] = value;
  }
  return normalized;
}

export function buildRecordOrder(type: string, sort: RecordSortInput | undefined, allowedColumns: Set<string>) {
  if (!sort?.column) return "";
  const direction = String(sort.direction || "").toLowerCase();
  if (!allowedColumns.has(sort.column)) throw new Error(`Invalid sort column: ${sort.column}`);
  if (direction !== "asc" && direction !== "desc") throw new Error("Invalid sort direction");
  return ` ORDER BY ${quoteIdentifier(type, sort.column)} ${direction.toUpperCase()}`;
}

export function buildRecordUpdate(type: string, values: Record<string, any>, key: Record<string, any>, allowedColumns: Set<string>) {
  const params: any[] = [];
  const placeholder = () => type === "postgresql" ? `$${params.length}` : "?";
  const valueRef = (value: any) => {
    params.push(value);
    return placeholder();
  };

  const set = Object.entries(values).map(([column, value]) => {
    if (!allowedColumns.has(column)) throw new Error(`Invalid update column: ${column}`);
    return `${quoteIdentifier(type, column)} = ${valueRef(value)}`;
  });
  const where = Object.entries(key).map(([column, value]) => {
    if (!allowedColumns.has(column)) throw new Error(`Invalid key column: ${column}`);
    return `${quoteIdentifier(type, column)} = ${valueRef(value)}`;
  });

  if (set.length === 0) throw new Error("No update values provided");
  if (where.length === 0) throw new Error("No record key provided");

  return { sql: ` SET ${set.join(", ")} WHERE ${where.join(" AND ")}`, params };
}

export function buildRecordWhere(type: string, filters: RecordFilterInput[] | undefined, allowedColumns: Set<string>) {
  const clauses: string[] = [];
  const params: string[] = [];
  const placeholder = () => type === "postgresql" ? `$${params.length}` : "?";
  const valueRef = (value: string) => {
    params.push(value);
    return type === "sqlite" ? quoteSqliteValue(value) : placeholder();
  };

  for (const filter of filters || []) {
    if (!filter?.enabled) continue;
    const column = String(filter.column || "");
    const operator = String(filter.operator || "").toUpperCase();
    if (!column || !allowedColumns.has(column)) throw new Error(`Invalid filter column: ${column}`);

    const columnSql = quoteIdentifier(type, column);
    const value = String(filter.value ?? "");
    const value2 = String(filter.value2 ?? "");

    if (["=", "!=", "<>", ">", ">=", "<", "<="].includes(operator)) {
      if (!value) continue;
      clauses.push(`${columnSql} ${operator} ${valueRef(value)}`);
    } else if (operator === "LIKE" || operator === "NOT LIKE") {
      if (!value) continue;
      const sqlOperator = type === "postgresql" ? operator.replace("LIKE", "ILIKE") : operator;
      clauses.push(`${columnSql} ${sqlOperator} ${valueRef(value)}`);
    } else if (operator === "CONTAINS" || operator === "NOT CONTAINS") {
      if (!value) continue;
      const sqlOperator = operator === "NOT CONTAINS" ? "NOT LIKE" : "LIKE";
      clauses.push(`${columnSql} ${type === "postgresql" ? sqlOperator.replace("LIKE", "ILIKE") : sqlOperator} ${valueRef(`%${value}%`)}`);
    } else if (operator === "IN" || operator === "NOT IN") {
      const values = splitList(value);
      if (values.length === 0) continue;
      clauses.push(`${columnSql} ${operator} (${values.map(valueRef).join(", ")})`);
    } else if (operator === "BETWEEN" || operator === "NOT BETWEEN") {
      if (!value || !value2) continue;
      clauses.push(`${columnSql} ${operator} ${valueRef(value)} AND ${valueRef(value2)}`);
    } else if (operator === "IS") {
      clauses.push(`${columnSql} IS NULL`);
    } else if (operator === "IS NOT") {
      clauses.push(`${columnSql} IS NOT NULL`);
    } else {
      throw new Error(`Invalid filter operator: ${operator}`);
    }
  }

  return {
    sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export async function fetchTableInfo(type: string, client: any, database: string, tableSchema: any): Promise<TableInfo> {
  if (type === "postgresql") {
    const result = await client.query(
      `SELECT
        pg_relation_size(format('%I.%I', $1::text, $2::text)::regclass)::bigint AS data_size,
        pg_indexes_size(format('%I.%I', $1::text, $2::text)::regclass)::bigint AS index_size,
        pg_total_relation_size(format('%I.%I', $1::text, $2::text)::regclass)::bigint AS total_size`,
      [tableSchema.table_schema || "public", tableSchema.table_name],
    );
    return {
      dataSize: Number(result.rows[0]?.data_size ?? 0),
      indexSize: Number(result.rows[0]?.index_size ?? 0),
      totalSize: Number(result.rows[0]?.total_size ?? 0),
    };
  }

  if (type === "mysql") {
    const [rows] = await client.execute(
      `SELECT DATA_LENGTH AS data_size, INDEX_LENGTH AS index_size, DATA_LENGTH + INDEX_LENGTH AS total_size
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [database, tableSchema.table_name],
    );
    const row = rows[0] || {};
    return {
      dataSize: Number(row.data_size ?? 0),
      indexSize: Number(row.index_size ?? 0),
      totalSize: Number(row.total_size ?? 0),
    };
  }

  return { dataSize: null, indexSize: null, totalSize: null };
}
