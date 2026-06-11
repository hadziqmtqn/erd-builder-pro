declare module "sql.js" {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  interface Database {
    run(sql: string): Database;
    exec(sql: string): QueryExecResult[];
    close(): void;
    export(): Uint8Array;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  const initSqlJs: (config?: any) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
