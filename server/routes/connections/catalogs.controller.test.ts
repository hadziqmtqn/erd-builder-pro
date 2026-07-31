import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { sqliteConnector } from "../../lib/db-connectors/sqlite.js";
import { buildRecordDelete, buildRecordInsert, buildRecordUpdate, buildRecordWhere, validateRecordValues } from "./catalogs.controller.js";
import { fetchTableInfo } from "./record-helpers.js";
import { limitSelectQuery, normalizeSelectQuery } from "./query-helpers.js";
import { buildCreateTableSql, buildIndexStatements, buildStructureStatements, removedEnumValues } from "./structure-helpers.js";
import { validateImportSql } from "./structure.controller.js";

describe("custom query helpers", () => {
  it("allows one SELECT/WITH statement and wraps it with a row limit", () => {
    expect(normalizeSelectQuery(" SELECT * FROM users; ")).toBe("SELECT * FROM users");
    expect(limitSelectQuery("SELECT * FROM users", 50)).toBe("SELECT * FROM (SELECT * FROM users) AS erd_custom_query LIMIT 50");
    expect(() => normalizeSelectQuery("UPDATE users SET name = 'x'")).toThrow("Only SELECT queries are allowed");
    expect(() => normalizeSelectQuery("SELECT 1; SELECT 2")).toThrow("Only one SQL statement is allowed");
    expect(() => normalizeSelectQuery("WITH changed AS (DELETE FROM users RETURNING id) SELECT * FROM changed")).toThrow("Only read-only SQL queries are allowed");
  });
});

describe("validateImportSql", () => {
  it("accepts table import SQL and rejects obvious wrong-driver files", () => {
    expect(validateImportSql("postgresql", 'CREATE TABLE "users" ("id" integer); INSERT INTO "users" ("id") VALUES (1);')).toHaveLength(2);
    expect(() => validateImportSql("postgresql", "CREATE TABLE `users` (`id` int AUTO_INCREMENT);")).toThrow("not PostgreSQL");
    expect(() => validateImportSql("mysql", 'CREATE TABLE "users" ("id" serial);')).toThrow("not MySQL");
    expect(() => validateImportSql("sqlite", "CREATE TABLE users (id int) ENGINE=InnoDB;")).toThrow("incompatible with SQLite");
  });
});

describe("buildRecordWhere", () => {
  const columns = new Set(["email", "role"]);

  it("builds PostgreSQL LIKE filters with valid placeholders and case-insensitive search", () => {
    const where = buildRecordWhere("postgresql", [
      { enabled: true, column: "email", operator: "LIKE", value: "%admin%" },
      { enabled: true, column: "role", operator: "CONTAINS", value: "owner" },
    ], columns);

    expect(where).toEqual({
      sql: ' WHERE "email" ILIKE $1 AND "role" ILIKE $2',
      params: ["%admin%", "%owner%"],
    });
  });

  it("builds PostgreSQL update statements with valid placeholders", () => {
    const update = buildRecordUpdate("postgresql", { email: "admin@example.com" }, { id: 7 }, new Set(["id", "email"]));

    expect(update).toEqual({
      sql: ' SET "email" = $1 WHERE "id" = $2',
      params: ["admin@example.com", 7],
    });
  });

  it("rejects unsafe record updates before sending them to the database", () => {
    const columns = new Map<string, any>([
      ["id", { name: "id", type: "integer", is_pk: true, is_nullable: false }],
      ["email", { name: "email", type: "character varying", is_nullable: false, max_length: 10 }],
      ["role", { name: "role", type: "users_role", is_nullable: false, enum_values: ["admin", "user"] }],
      ["price", { name: "price", type: "numeric", is_nullable: false, numeric_precision: 5, numeric_scale: 2 }],
      ["meta", { name: "meta", type: "jsonb", is_nullable: true }],
    ]);

    expect(() => validateRecordValues("postgresql", { id: 8 }, columns)).toThrow("Primary key column cannot be updated");
    expect(() => validateRecordValues("postgresql", { email: null }, columns)).toThrow("Column cannot be null");
    expect(() => validateRecordValues("postgresql", { email: "too-long@example.com" }, columns)).toThrow("Value too long");
    expect(() => validateRecordValues("postgresql", { role: "owner" }, columns)).toThrow("Invalid enum value");
    expect(() => validateRecordValues("postgresql", { price: 1234.56 }, columns)).toThrow("numeric precision");
    expect(() => validateRecordValues("postgresql", { price: 12.345 }, columns)).toThrow("numeric scale");
    expect(() => validateRecordValues("postgresql", { meta: "{bad" }, columns)).toThrow("valid JSON");
    expect(validateRecordValues("postgresql", { email: "a@b.test", role: "admin", price: 123.45, meta: { ok: true } }, columns)).toEqual({
      email: "a@b.test",
      role: "admin",
      price: 123.45,
      meta: { ok: true },
    });
  });

  it("allows only 0 or 1 for boolean columns and normalizes PostgreSQL booleans", () => {
    const columns = new Map<string, any>([
      ["pg_flag", { name: "pg_flag", type: "boolean", is_nullable: false }],
      ["mysql_flag", { name: "mysql_flag", type: "tinyint", full_type: "tinyint(1)", is_nullable: false }],
    ]);

    expect(() => validateRecordValues("postgresql", { pg_flag: true }, columns)).toThrow("0 or 1");
    expect(() => validateRecordValues("mysql", { mysql_flag: 2 }, columns)).toThrow("0 or 1");
    expect(validateRecordValues("postgresql", { pg_flag: 1 }, columns)).toEqual({ pg_flag: true });
    expect(validateRecordValues("postgresql", { pg_flag: 0 }, columns)).toEqual({ pg_flag: false });
    expect(validateRecordValues("mysql", { mysql_flag: 1 }, columns)).toEqual({ mysql_flag: 1 });
  });

  it("rejects MySQL unsigned negatives and invalid date/time text", () => {
    const columns = new Map<string, any>([
      ["count", { name: "count", type: "int", full_type: "int unsigned", is_nullable: false }],
      ["published_on", { name: "published_on", type: "date", is_nullable: false }],
      ["starts_at", { name: "starts_at", type: "time", is_nullable: false }],
      ["created_at", { name: "created_at", type: "timestamp", is_nullable: false }],
    ]);

    expect(() => validateRecordValues("mysql", { count: -1 }, columns)).toThrow("unsigned");
    expect(() => validateRecordValues("mysql", { published_on: "26-07-2026" }, columns)).toThrow("YYYY-MM-DD");
    expect(() => validateRecordValues("mysql", { starts_at: "25:00" }, columns)).toThrow("HH:MM");
    expect(() => validateRecordValues("mysql", { created_at: "2026-07-26" }, columns)).toThrow("timestamp");
    expect(validateRecordValues("mysql", {
      count: 1,
      published_on: "2026-07-26",
      starts_at: "17:30:00",
      created_at: "2026-07-26 17:30:00",
    }, columns)).toEqual({
      count: 1,
      published_on: "2026-07-26",
      starts_at: "17:30:00",
      created_at: "2026-07-26 17:30:00",
    });
  });
});

describe("record mutations", () => {
  const columns = new Set(["id", "email"]);

  it("builds insert and delete statements with PostgreSQL placeholders", () => {
    expect(buildRecordInsert("postgresql", { email: "a@test.dev", id: 1 }, columns)).toEqual({
      sql: ' ("email", "id") VALUES ($1, $2)',
      params: ["a@test.dev", 1],
    });
    expect(buildRecordDelete("postgresql", { id: 1 }, columns)).toEqual({
      sql: ' WHERE "id" = $1',
      params: [1],
    });
  });
});

describe("fetchTableInfo", () => {
  it("casts PostgreSQL table-info parameters so pg can infer their type", async () => {
    let sql = "";
    let params: any[] = [];
    const client = {
      query: async (nextSql: string, nextParams: any[]) => {
        sql = nextSql;
        params = nextParams;
        return { rows: [{ data_size: "1", index_size: "2", total_size: "3" }] };
      },
    };

    await fetchTableInfo("postgresql", client, "unused", { table_schema: "public", table_name: "users" });

    expect(sql).toContain("$1::text");
    expect(sql).toContain("$2::text");
    expect(params).toEqual(["public", "users"]);
  });
});

describe("buildStructureStatements", () => {
  const table = {
    table_name: "posts",
    table_schema: "public",
    columns: [{ name: "user_id", type: "integer", full_type: "integer", is_nullable: false }],
    foreign_keys: [{ column: "user_id", ref_table: "users", ref_column: "id", constraint_name: "posts_user_id_fkey" }],
  };

  it("builds PostgreSQL structure edits with quoted identifiers", () => {
    expect(buildStructureStatements("postgresql", table, {
      tableName: "articles",
      columnName: "user_id",
      column: { name: "author_id", type: "bigint", is_nullable: true, column_default: null },
      foreignKey: { enabled: true, ref_table: "users", ref_column: "id" },
    })).toEqual([
      'ALTER TABLE "public"."posts" RENAME TO "articles"',
      'ALTER TABLE "public"."articles" RENAME COLUMN "user_id" TO "author_id"',
      'ALTER TABLE "public"."articles" ALTER COLUMN "author_id" DROP DEFAULT',
      'ALTER TABLE "public"."articles" ALTER COLUMN "author_id" TYPE bigint USING "author_id"::bigint',
      'ALTER TABLE "public"."articles" ALTER COLUMN "author_id" DROP NOT NULL',
      'ALTER TABLE "public"."articles" ALTER COLUMN "author_id" SET DEFAULT NULL',
      'ALTER TABLE "public"."articles" DROP CONSTRAINT IF EXISTS "posts_user_id_fkey"',
      'ALTER TABLE "public"."articles" ADD CONSTRAINT "fk_articles_author_id" FOREIGN KEY ("author_id") REFERENCES "users" ("id")',
    ]);
  });

  it("allows character length on compatible column types", () => {
    expect(buildStructureStatements("postgresql", table, {
      columnName: "user_id",
      column: { name: "user_id", type: "varchar(120)", is_nullable: true },
    })).toContain('ALTER TABLE "public"."posts" ALTER COLUMN "user_id" TYPE varchar(120) USING "user_id"::varchar(120)');
    expect(buildStructureStatements("postgresql", table, {
      columnName: "user_id",
      column: { name: "user_id", type: "numeric(10,2)", is_nullable: true },
    })).toContain('ALTER TABLE "public"."posts" ALTER COLUMN "user_id" TYPE numeric(10,2) USING "user_id"::numeric(10,2)');
    expect(buildStructureStatements("postgresql", table, {
      columnName: "user_id",
      column: { name: "user_id", type: "int2", is_nullable: true },
    })).toContain('ALTER TABLE "public"."posts" ALTER COLUMN "user_id" TYPE int2 USING "user_id"::int2');
    expect(() => buildStructureStatements("postgresql", table, {
      columnName: "user_id",
      column: { name: "user_id", type: "varchar(0)", is_nullable: true },
    })).toThrow("Invalid column length");
    expect(() => buildStructureStatements("postgresql", table, {
      columnName: "user_id",
      column: { name: "user_id", type: "integer(10)", is_nullable: true },
    })).toThrow("Invalid column type");
  });

  it("builds create table statements", () => {
    expect(buildStructureStatements("postgresql", {}, {
      createTable: { name: "customers", column: { name: "id", type: "int8", is_nullable: false } },
    })).toEqual(['CREATE TABLE "customers" ("id" int8 NOT NULL)']);
    expect(buildStructureStatements("postgresql", {}, {
      createTable: { name: "customers", column: { name: "id", type: "bigserial", is_nullable: false } },
    })).toEqual(['CREATE TABLE "customers" ("id" bigserial NOT NULL, PRIMARY KEY ("id"))']);
    expect(buildStructureStatements("mysql", {}, {
      createTable: { name: "customers", column: { name: "amount", type: "decimal(10,2)", is_nullable: false } },
    })).toEqual(['CREATE TABLE `customers` (`amount` decimal(10,2) NOT NULL)']);
    expect(buildStructureStatements("mysql", {}, {
      createTable: { name: "customers", column: { name: "id", type: "bigint", is_nullable: false, extra: "AUTO_INCREMENT" } },
    })).toEqual(['CREATE TABLE `customers` (`id` bigint NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`))']);
    expect(buildStructureStatements("mysql", {}, {
      createTable: { name: "customers", column: { name: "name", type: "varchar", is_nullable: false } },
    })).toEqual(['CREATE TABLE `customers` (`name` varchar(255) NOT NULL)']);
  });

  it("builds safe table delete statements", () => {
    const schema = [{ table_name: "posts" }, { table_name: "comments" }];
    expect(buildStructureStatements("postgresql", {}, { deleteTables: ["posts"], cascade: true }, schema)).toEqual([
      'DROP TABLE "posts" CASCADE',
    ]);
    expect(buildStructureStatements("mysql", {}, { deleteTables: ["posts", "comments"], ignoreForeignKeys: true }, schema)).toEqual([
      "SET FOREIGN_KEY_CHECKS=0",
      "DROP TABLE `posts`",
      "DROP TABLE `comments`",
      "SET FOREIGN_KEY_CHECKS=1",
    ]);
    expect(() => buildStructureStatements("postgresql", {}, { deleteTables: ["posts;drop"] }, schema)).toThrow("Invalid table name");
  });

  it("builds truncate and clone table statements", () => {
    const schema = [{ table_name: "posts" }];
    expect(buildStructureStatements("postgresql", {}, { truncateTables: ["posts"], cascade: true }, schema)).toEqual([
      'TRUNCATE TABLE "posts" CASCADE',
    ]);
    expect(buildStructureStatements("mysql", {}, { truncateTables: ["posts"], ignoreForeignKeys: true }, schema)).toEqual([
      "SET FOREIGN_KEY_CHECKS=0",
      "TRUNCATE TABLE `posts`",
      "SET FOREIGN_KEY_CHECKS=1",
    ]);
    expect(buildStructureStatements("mysql", {}, { cloneTable: { source: "posts", target: "posts_copy", withData: true } }, schema)).toEqual([
      "CREATE TABLE `posts_copy` LIKE `posts`",
      "INSERT INTO `posts_copy` SELECT * FROM `posts`",
    ]);
  });

  it("rejects unsafe structure identifiers and column types", () => {
    expect(() => buildStructureStatements("postgresql", table, { tableName: "posts;drop" })).toThrow("Invalid table name");
    expect(() => buildStructureStatements("postgresql", table, {
      columnName: "user_id",
      column: { name: "user_id", type: "text;drop table users", is_nullable: true },
    })).toThrow("Invalid column type");
    expect(() => buildStructureStatements("postgresql", table, {
      columnName: "user_id",
      column: { name: "user_id", type: "longtext", is_nullable: true },
    })).toThrow("Invalid postgresql column type");
    expect(() => buildStructureStatements("mysql", { ...table, table_schema: undefined }, {
      columnName: "user_id",
      column: { name: "user_id", type: "uuid", is_nullable: true },
    })).toThrow("Invalid mysql column type");
  });

  it("rejects foreign keys with incompatible column types", () => {
    const schema = [
      table,
      { table_name: "users", columns: [{ name: "id", type: "uuid", full_type: "uuid" }] },
    ];

    expect(() => buildStructureStatements("postgresql", table, {
      columnName: "user_id",
      column: { name: "user_id", type: "integer", is_nullable: false },
      foreignKey: { enabled: true, ref_table: "users", ref_column: "id" },
    }, schema)).toThrow("Foreign key column type must match");
  });

  it("rejects renaming parent tables used by child tables", () => {
    const users = { table_name: "users", columns: [{ name: "id", type: "integer", full_type: "integer" }] };
    const posts = { table_name: "posts", foreign_keys: [{ column: "user_id", ref_table: "users", ref_column: "id" }] };
    expect(() => buildStructureStatements("postgresql", users, { tableName: "accounts" }, [users, posts])).toThrow('Table "users" is referenced by child table "posts"');
    expect(() => buildStructureStatements("mysql", users, { tableName: "accounts" }, [users, posts])).toThrow('Table "users" is referenced by child table "posts"');
  });

  it("builds add-column edits with MySQL comment and extra metadata", () => {
    expect(buildStructureStatements("mysql", { ...table, table_schema: undefined }, {
      columnName: "__new__",
      column: { name: "name", type: "varchar", is_nullable: false, column_default: "", extra: "", comment: "person name" },
    })).toEqual([
      "ALTER TABLE `posts` ADD COLUMN `name` varchar(255) NOT NULL COMMENT 'person name'",
    ]);
  });

  it("builds enum value edits for MySQL and PostgreSQL", () => {
    expect(buildStructureStatements("mysql", { ...table, table_schema: undefined }, {
      columnName: "user_id",
      column: { name: "user_id", type: "enum", is_nullable: false, enum_values: ["admin", "user"] },
    })).toContain("ALTER TABLE `posts` MODIFY COLUMN `user_id` enum('admin','user') NOT NULL");
    expect(buildStructureStatements("postgresql", {
      ...table,
      columns: [{ name: "status", type: "post_status", full_type: "USER-DEFINED", is_nullable: false, enum_values: ["draft"] }],
    }, {
      columnName: "status",
      column: { name: "status", type: "post_status", is_nullable: false, enum_values: ["draft", "published"] },
    })).toContain('ALTER TYPE "post_status" ADD VALUE IF NOT EXISTS \'published\'');
    expect(removedEnumValues({ enum_values: ["draft", "published"] }, ["draft"])).toEqual(["published"]);
  });

  it("builds create and replace index statements", () => {
    const indexedTable = {
      ...table,
      indexes: [{ name: "posts_user_id_idx", is_unique: false, is_primary: false, column_name: "user_id", algorithm: "btree" }],
    };

    expect(buildIndexStatements("postgresql", indexedTable, {
      indexName: "posts_user_id_idx",
      index: { name: "posts_user_id_unique", columns: ["user_id"], is_unique: true, algorithm: "btree" },
    })).toEqual([
      'DROP INDEX "public"."posts_user_id_idx"',
      'CREATE UNIQUE INDEX "posts_user_id_unique" ON "public"."posts" USING btree ("user_id")',
    ]);
    expect(() => buildIndexStatements("postgresql", {
      ...indexedTable,
      indexes: [{ name: "posts_pkey", is_primary: true, column_name: "user_id" }],
    }, {
      indexName: "posts_pkey",
      index: { name: "posts_pkey", columns: ["user_id"], is_unique: true },
    })).toThrow("Invalid index name");
    expect(() => buildIndexStatements("postgresql", indexedTable, {
      indexName: "__new__",
      index: { name: "another_idx", columns: ["user_id"], is_unique: false, algorithm: "btree" },
    })).toThrow("Duplicate index definition");
  });

  it("renders PostgreSQL table SQL with indexes as separate statements", () => {
    expect(buildCreateTableSql("postgresql", {
      ...table,
      indexes: [{ name: "posts_user_id_idx", is_unique: false, is_primary: false, column_name: "user_id", algorithm: "btree" }],
    })).toContain('CREATE INDEX "posts_user_id_idx" ON "public"."posts" USING btree ("user_id");');
  });
});

describe("SQLite schema metadata", () => {
  it("includes defaults, foreign keys, and indexes for Structure view", async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`
      CREATE TABLE users (id integer PRIMARY KEY);
      CREATE TABLE posts (
        id integer PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        title text DEFAULT 'draft'
      );
      CREATE UNIQUE INDEX posts_user_title_index ON posts(user_id, title);
    `);

    const schema = await sqliteConnector.fetchSchema(db, { type: "sqlite", database: "" });
    const posts = schema.find(table => table.table_name === "posts");

    expect(posts?.columns.find(column => column.name === "title")?.column_default).toBe("'draft'");
    expect(posts?.foreign_keys).toContainEqual(expect.objectContaining({
      column: "user_id",
      ref_table: "users",
      ref_column: "id",
    }));
    expect(posts?.indexes).toContainEqual(expect.objectContaining({
      name: "posts_user_title_index",
      is_unique: true,
      column_name: "user_id,title",
    }));

    db.close();
  });
});
