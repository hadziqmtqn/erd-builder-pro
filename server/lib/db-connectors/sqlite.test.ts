import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import initSqlJs from "sql.js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { sqliteConnector } from "./sqlite.js";

const dir = fs.mkdtempSync(join(tmpdir(), "erd-sqlite-"));
const info = { type: "sqlite" as const, database: join(dir, "shop.db") };

beforeAll(async () => {
  const db = new (await initSqlJs()).Database();
  db.run("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
  fs.writeFileSync(info.database, db.export());
  db.close();
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

it("rejects without stopping the server when the sql.js WASM is missing, then loads it on the next try (BUG-064)", async () => {
  const read = fs.readFileSync;
  const spy = vi.spyOn(fs, "readFileSync").mockImplementation(((path: any, ...rest: any[]) => {
    if (String(path).endsWith("sql-wasm.wasm")) throw Object.assign(new Error("ENOENT: sql-wasm.wasm"), { code: "ENOENT" });
    return (read as any)(path, ...rest);
  }) as typeof fs.readFileSync);
  await expect(sqliteConnector.test(info)).rejects.toThrow("ENOENT");
  spy.mockRestore();

  await expect(sqliteConnector.test(info)).resolves.toMatch(/^OK/);
  const conn = await sqliteConnector.connect(info);
  expect((await sqliteConnector.fetchSchema(conn.client, info)).map((t) => t.table_name)).toEqual(["customers"]);
  conn.release();
});
