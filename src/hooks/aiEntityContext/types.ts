import { supabase } from '@/lib/supabase';

export interface EntityContext {
  entityType: string;
  entityUid: string;
}

export interface EntityContextResult {
  contextText: string;
  projectId: number | string | null;
}

export interface EntityContextData {
  title?: string;
  content?: string;
  nodes?: any[];
  edges?: any[];
}

export const PREVIEW_CHARS = 1500;
export const MAX_CHARS_TOTAL = 3000;
