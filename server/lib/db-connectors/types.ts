export type DbType = "postgresql" | "mysql" | "sqlite";

export interface ConnectionInfo {
  type: DbType;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database: string;
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
}

export interface DbConnector {
  connect(info: ConnectionInfo): Promise<ConnectorClient>;
  test(info: ConnectionInfo): Promise<string>;
  fetchSchema(client: any, info: ConnectionInfo): Promise<TableSchema[]>;
}
