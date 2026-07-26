import { describe, expect, it } from "vitest";
import { buildRecordWhere } from "./catalogs.controller.js";

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
});
