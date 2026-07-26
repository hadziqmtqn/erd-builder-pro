import { describe, expect, it } from "vitest";
import { buildRecordUpdate, buildRecordWhere, validateRecordValues } from "./catalogs.controller.js";

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
