import fs from "node:fs";
import initSqlJs from "sql.js";
import type { ConnectionInfo, ConnectorClient, TableSchema, DbConnector } from "./types.js";

type CachedDatabase = { db: any; signature: string; refs: number };
// ponytail: one in-process SQLite handle per file; mtime/size changes trigger a reload.
const databases = new Map<string, CachedDatabase>();
let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

function getSql() {
  return sqlPromise || (sqlPromise = initSqlJs());
}

function fileSignature(path: string) {
  const stat = fs.statSync(path);
  return `${stat.mtimeMs}:${stat.size}`;
}

export const sqliteConnector: DbConnector = {
  async connect(info: ConnectionInfo): Promise<ConnectorClient> {
    const signature = fileSignature(info.database);
    const current = databases.get(info.database);
    if (current?.signature === signature) {
      current.refs += 1;
      let released = false;
      return {
        client: current.db,
        release: () => {
          if (!released) { released = true; current.refs -= 1; }
        },
      };
    }

    if (current?.refs === 0) current.db.close();
    const SQL = await getSql();
    const entry: CachedDatabase = { db: new SQL.Database(fs.readFileSync(info.database)), signature, refs: 1 };
    databases.set(info.database, entry);
    let released = false;
    return {
      client: entry.db,
      release: () => {
        if (!released) {
          released = true;
          entry.refs -= 1;
          if (entry !== databases.get(info.database) && entry.refs === 0) entry.db.close();
        }
      },
    };
  },

  async test(info: ConnectionInfo): Promise<string> {
    const start = Date.now();
    const SQL = await getSql();
    const buffer = fs.readFileSync(info.database);
    const db = new SQL.Database(buffer);
    db.run("SELECT 1");
    db.close();
    return `OK (${Date.now() - start}ms)`;
  },

  async fetchSchema(client: any, _info: ConnectionInfo): Promise<TableSchema[]> {
    const db = client as any;
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    if (!tables.length) return [];

    const rows: TableSchema[] = [];
    for (const t of tables[0].values) {
      const tableName = t[0] as string;
      const colInfo = db.exec(`PRAGMA table_info("${tableName}")`);
      const columns = colInfo[0]?.values.map((col: any[]) => ({
        name: col[1],
        type: col[2],
        column_default: col[4],
        is_pk: col[5] === 1,
        is_nullable: col[3] === 0,
        sort_order: col[0] + 1,
      })) || [];

      // Fetch foreign keys
      const fkInfo = db.exec(`PRAGMA foreign_key_list("${tableName}")`);
      const foreign_keys = fkInfo[0]?.values.map((fk: any[]) => ({
        column: fk[3],      // "from" — source column
        ref_table: fk[2],    // "table" — target table
        ref_column: fk[4],   // "to" — target column
        constraint_name: `fk_${tableName}_${fk[3]}`,
        on_update: fk[5],
        on_delete: fk[6],
      })) || [];

      const indexInfo = db.exec(`PRAGMA index_list("${tableName}")`);
      const indexes = indexInfo[0]?.values.map((idx: any[]) => {
        const cols = db.exec(`PRAGMA index_info("${idx[1]}")`);
        return {
          name: idx[1],
          algorithm: 'BTREE',
          is_unique: idx[2] === 1,
          is_primary: idx[3] === 'pk',
          column_name: cols[0]?.values.map((col: any[]) => col[2]).join(',') || '',
        };
      }) || [];

      rows.push({ table_name: tableName, columns, foreign_keys, indexes });
    }
    return rows;
  },
};
