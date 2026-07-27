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

export function limitSelectQuery(sql: string, limit: number): string {
  const rowLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  return `SELECT * FROM (${sql}) AS erd_custom_query LIMIT ${rowLimit}`;
}
