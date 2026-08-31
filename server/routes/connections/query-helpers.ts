export function normalizeSelectQuery(script: string): string {
  const sql = String(script || "").trim().replace(/;+$/g, "").trim();
  if (!sql) throw new Error("SQL query is required");
  if (!/^(select|with)\b/i.test(sql)) throw new Error("Only SELECT queries are allowed");
  if (sql.includes(";")) throw new Error("Only one SQL statement is allowed");
  if (/\b(insert|update|delete|alter|drop|create|truncate|merge|grant|revoke|call|execute)\b/i.test(sql)) {
    throw new Error("Only read-only SQL queries are allowed");
  }
  return sql;
}

export function buildLimitedSelectQuery(script: string, requestedRows: unknown) {
  const sql = normalizeSelectQuery(script);
  const maxRows = Math.min(Math.max(Math.trunc(Number(requestedRows) || 100), 1), 500);
  return { sql: `SELECT * FROM (${sql}) AS erdbpro_limited_query LIMIT ${maxRows + 1}`, maxRows };
}
