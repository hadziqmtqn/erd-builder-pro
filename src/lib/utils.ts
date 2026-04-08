import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const COLUMN_TYPES = [
  "INT",
  "BIGINT",
  "VARCHAR",
  "CHAR",
  "TEXT",
  "BOOLEAN",
  "DATE",
  "TIMESTAMP",
  "FLOAT",
  "DOUBLE",
  "DECIMAL",
  "UUID",
  "JSON",
  "ENUM",
];

export const RELATIONSHIP_TYPES = [
  { value: "one-to-one", label: "1:1 (One to One)", shortLabel: "1:1" },
  { value: "one-to-many", label: "1:N (One to Many)", shortLabel: "1:N" },
  { value: "many-to-many", label: "N:M (Many to Many)", shortLabel: "N:M" },
];
