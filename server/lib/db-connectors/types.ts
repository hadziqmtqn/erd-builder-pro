export type DbType = "postgresql" | "mysql" | "sqlite";

export interface ConnectionInfo {
  type: DbType;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database: string;
  environment?: "local" | "development" | "staging" | "production";
  safeMode?: "normal" | "protected" | "read-only";
  sslMode?: "disable" | "require" | "verify-ca" | "verify-full";
  sslCa?: string;
  sslCert?: string;
  sslKey?: string;
  queryTimeoutMs?: number;
}

export interface ForeignKeySchema {
  column: string;
  ref_table: string;
  ref_column: string;
  constraint_name?: string;
  on_delete?: string;
  on_update?: string;
}

export interface ColumnSchema {
  name: string;
  type: string;
  full_type?: string | null;
  character_set?: string | null;
  collation?: string | null;
  column_default?: string | null;
  extra?: string | null;
  comment?: string | null;
  is_pk: boolean;
  is_nullable: boolean;
  sort_order: number;
  max_length?: number | null;
  numeric_precision?: number | null;
  numeric_scale?: number | null;
  is_generated?: boolean;
  enum_values?: string[] | string | null;
  is_fk?: boolean;
  ref_table?: string;
  ref_column?: string;
}

export function erdColumnType(column: ColumnSchema): string {
  const fullType = String(column.full_type || '').trim();
  const hasEnumValues = Array.isArray(column.enum_values) ? column.enum_values.length > 0 : Boolean(column.enum_values);
  const rawType = hasEnumValues && /^user-defined$/i.test(fullType)
    ? 'ENUM'
    : !fullType || /^user-defined$/i.test(fullType) ? String(column.type || 'VARCHAR') : fullType;
  return rawType
    .replace(/\([^)]*\)/g, '')
    .replace(/^character varying\b/i, 'VARCHAR')
    .replace(/^character\b/i, 'CHAR')
    .replace(/^integer\b/i, 'INT')
    .replace(/^double precision\b/i, 'DOUBLE')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export interface TableSchema {
  table_name: string;
  table_schema?: string;
  comment?: string | null;
  columns: ColumnSchema[];
  foreign_keys?: ForeignKeySchema[];
  indexes?: {
    name: string;
    algorithm?: string | null;
    is_unique: boolean;
    column_name: string;
    is_primary?: boolean;
  }[];
  checks?: { name?: string | null; expression: string }[];
}

export interface ConnectorClient {
  client: any;
  release: () => void;
  cancel?: () => Promise<void>;
}

export interface DbConnector {
  connect(info: ConnectionInfo): Promise<ConnectorClient>;
  test(info: ConnectionInfo): Promise<string>;
  fetchSchema(client: any, info: ConnectionInfo): Promise<TableSchema[]>;
}
