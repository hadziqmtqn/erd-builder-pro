import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const COLUMN_TYPES = [
  // MySQL
  "INT", "BIGINT", "TINYINT", "SMALLINT", "MEDIUMINT",
  "VARCHAR", "CHAR", "TEXT", "TINYTEXT", "MEDIUMTEXT", "LONGTEXT",
  "BINARY", "VARBINARY",
  "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB",
  "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL",
  "BOOLEAN",
  "DATE", "TIME", "YEAR", "DATETIME", "TIMESTAMP",
  "BIT", "ENUM", "JSON",
  // PostgreSQL aliases & extra
  "INTEGER",
  "SERIAL", "BIGSERIAL", "SMALLSERIAL",
  "MONEY",
  "BYTEA",
"UUID", "ULID", "JSONB",
  "INTERVAL",
  "TIMESTAMPTZ", "TIMETZ",
  "CIDR", "INET", "MACADDR", "MACADDR8",
  "TSVECTOR", "TSQUERY",
];

export const RELATIONSHIP_TYPES = [
  { value: "one-to-one", label: "1:1 (One to One)", shortLabel: "1:1" },
  { value: "one-to-many", label: "1:N (One to Many)", shortLabel: "1:N" },
  { value: "many-to-many", label: "N:M (Many to Many)", shortLabel: "N:M" },
];
