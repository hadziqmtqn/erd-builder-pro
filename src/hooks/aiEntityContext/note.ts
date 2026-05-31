import { supabase, supabaseConfigured } from '@/lib/supabase';
import { PREVIEW_CHARS, EntityContextData } from './types';

export async function fetchNote(uid: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('notes')
    .select('title, content, project_id')
    .eq('uid', uid)
    .single();

  if (error || !data) return null;

  const contentPreview = data.content
    ? data.content.slice(0, PREVIEW_CHARS)
    : '(empty)';

  return {
    title: data.title,
    projectId: data.project_id,
    summary: `Title: ${data.title}\nContent preview:\n${contentPreview}`,
  };
}

export function buildNoteContext(data: EntityContextData): string | null {
  if (!data.content && !data.title) return null;
  const content = String(data.content || '').slice(0, 4000);
  return `[Current file info]
You are currently viewing this note:
Title: ${data.title || '(untitled)'}
Content:
${content}`;
}
