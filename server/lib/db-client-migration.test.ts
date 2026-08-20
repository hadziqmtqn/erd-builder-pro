import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalUrl = process.env.DATABASE_URL;
let tempPath: string | null = null;

afterEach(async () => {
  process.env.DATABASE_URL = originalUrl;
  vi.resetModules();
  if (tempPath) rmSync(tempPath, { recursive: true, force: true });
  tempPath = null;
});

describe('DB Client startup migration', () => {
  it('copies legacy data once and leaves the source intact', async () => {
    tempPath = mkdtempSync(join(tmpdir(), 'erdbpro-db-client-migration-'));
    const dbPath = join(tempPath, 'legacy.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE projects (id INTEGER PRIMARY KEY);
      CREATE TABLE db_accounts (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE TABLE db_catalogs (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL);
      CREATE TABLE diagrams (
        id INTEGER PRIMARY KEY, uid TEXT, name TEXT NOT NULL, user_id TEXT, project_id INTEGER,
        source_type TEXT, source_connection_id INTEGER, data TEXT, is_deleted BOOLEAN DEFAULT false,
        deleted_at DATETIME, created_at DATETIME, updated_at DATETIME, _version INTEGER DEFAULT 0
      );
      CREATE TABLE sql_queries (
        id INTEGER PRIMARY KEY, uid TEXT, diagram_id INTEGER NOT NULL, group_name TEXT,
        name TEXT NOT NULL, script TEXT NOT NULL, created_at DATETIME, updated_at DATETIME
      );
      INSERT INTO users VALUES ('local-user');
      INSERT INTO projects VALUES (7);
      INSERT INTO db_accounts VALUES (3, 'local-user');
      INSERT INTO db_catalogs VALUES (4, 3);
      INSERT INTO diagrams VALUES (11, 'legacy-client', 'Production', 'local-user', 7, 'production_db', 4,
        '{"nodes":{"users":{"x":10,"y":20}},"source":{"password_encrypted":"secret"}}', 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2);
      INSERT INTO sql_queries VALUES (21, 'legacy-query', 11, 'Reports', 'Users', 'SELECT * FROM users', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `);
    db.close();

    process.env.DATABASE_URL = `file:${dbPath}`;
    vi.resetModules();
    const [{ migrateDbClients }, { prisma }] = await Promise.all([
      import('./db-client-migration.js'), import('./prisma.js'),
    ]);
    await migrateDbClients();
    await migrateDbClients();
    await prisma?.$disconnect();

    const result = new Database(dbPath, { readonly: true });
    expect(result.prepare('SELECT COUNT(*) count FROM db_clients').get()).toEqual({ count: 1 });
    expect(result.prepare('SELECT legacy_diagram_id, user_id, project_id, catalog_id FROM db_clients').get())
      .toEqual({ legacy_diagram_id: 11, user_id: 'local-user', project_id: 7, catalog_id: 4 });
    expect(result.prepare('SELECT legacy_query_id FROM db_client_queries').get()).toEqual({ legacy_query_id: 21 });
    expect(String((result.prepare('SELECT data FROM db_client_layouts').get() as any).data)).not.toContain('password_encrypted');
    expect(result.prepare('SELECT COUNT(*) count FROM diagrams WHERE id = 11').get()).toEqual({ count: 1 });
    result.close();
  });
});
