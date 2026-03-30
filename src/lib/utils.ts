import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const COLUMN_TYPES = [
  "INT",
  "VARCHAR",
  "TEXT",
  "BOOLEAN",
  "DATE",
  "TIMESTAMP",
  "FLOAT",
  "DECIMAL",
  "UUID",
  "JSON",
];

export const RELATIONSHIP_TYPES = [
  { value: "one-to-one", label: "1:1" },
  { value: "one-to-many", label: "1:N" },
  { value: "many-to-many", label: "N:M" },
];
