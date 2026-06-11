export type DbType = "postgresql" | "mysql" | "sqlite";

export interface ConnectionInfo {
  type: DbType;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database: string;
}

export interface ColumnSchema {
  name: string;
  type: string;
  is_pk: boolean;
  is_nullable: boolean;
  sort_order: number;
}

export interface TableSchema {
  table_name: string;
  table_schema?: string;
  columns: ColumnSchema[];
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
