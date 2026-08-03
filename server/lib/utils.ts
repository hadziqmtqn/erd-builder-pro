import { Response as ExpressResponse } from "express";
import { SUPABASE_URL } from "./config.js";

/**
 * Standardize API error responses — never leak internal error details
 */
export const handleError = (res: ExpressResponse, _error: any, message: string = "Internal Server Error") => {
  console.error(`${message}:`, _error);
  return res.status(500).json({ 
    error: message
  });
};

/**
 * Standardize Supabase soft delete/restore updates
 */
export const getSafeUpdate = (is_deleted: boolean) => {
  return {
    is_deleted,
    deleted_at: is_deleted ? new Date().toISOString() : null
  };
};

/**
 * Helper to build the query for active items (not deleted and parent project not deleted)
 * Note: This requires the 'projects' table to be joined as 'projects!left(*)'
 */
export const getActiveFilter = () => {
  // Logic: (is_deleted is false) AND (project_id is null OR projects.is_deleted is false)
  // In Supabase, this is often best handled by individual .eq('is_deleted', false) 
  // followed by a JS filter if the DB doesn't support complex joins easily.
  // BUT we can use .or() for more advanced filtering if needed.
};

/**
 * Convert a project_id string to the correct type for Prisma queries.
 * SQLite and local PostgreSQL use Int; Supabase PostgreSQL uses BigInt.
 */
export function toProjectId(projectId: string): number | bigint {
 const url = process.env.DATABASE_URL || "";
 const isSqlite = url.startsWith("file:") || url.endsWith(".db");
 const isSupabasePg = url.startsWith("postgresql://") && !!SUPABASE_URL;
 if (isSqlite) return Number(projectId);
 if (isSupabasePg) return BigInt(projectId);
 return Number(projectId);
}

/**
 * Build a Prisma `where` clause that matches by `uid` (UUID) or numeric `id`.
 * Both PostgreSQL (BigInt) and SQLite (Int) use autoincrement ids internally,
 * while `uid` is the user-facing stable identifier. This dual-lookup allows
 * callers that pass numeric IDs (e.g. from desktop SQLite or legacy drafts)
 * to still find the record.
 */
export function uidOrIdWhere(identifier: string, userId?: string, extra: Record<string, any> = {}) {
  const numericId = /^\d+$/.test(identifier) ? Number(identifier) : undefined;
  const where: any = {
    OR: [
      { uid: identifier },
      ...(numericId !== undefined ? [{ id: numericId }] : []),
    ],
    ...extra,
  };
  if (userId) {
    where.userId = userId;
  }
  return where;
}
