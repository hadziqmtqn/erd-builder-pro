import { Response as ExpressResponse } from "express";

/**
 * Standardize API error responses
 */
export const handleError = (res: ExpressResponse, error: any, message: string = "Internal Server Error") => {
  console.error(`${message}:`, error);
  return res.status(500).json({ 
    error: error?.message || message,
    details: error 
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
  // followed by a JS filter if the DB schema doesn't support complex joins easily.
  // BUT we can use .or() for more advanced filtering if needed.
};
