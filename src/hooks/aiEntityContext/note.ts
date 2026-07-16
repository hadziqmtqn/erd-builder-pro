import { apiFetch } from '@/lib/api';
import { PREVIEW_CHARS, EntityContextData } from './types';

export async function fetchNote(uid: string) {
  try {
    const res = await apiFetch(`/api/notes/${uid}`);
    if (!res.ok) return null;
    const data = await res.json();
    const contentPreview = data.content
      ? data.content.slice(0, PREVIEW_CHARS)
      : '(empty)';
    return {
      title: data.title,
      projectId: data.project_id,
      summary: `Title: ${data.title}\nContent preview:\n${contentPreview}`,
    };
  } catch {
    return null;
  }
}

export function buildNoteContext(data: EntityContextData): string | null {
  if (!data.content && !data.title) return null;
  const content = String(data.content || '').slice(0, 4000);
  return `[Current file info]
You are currently viewing this note:
Title: ${data.title || '(untitled)'}
Content:
${content}

If the project has related ERDs or Flowcharts (listed above), this note may document their schema or business logic. Cross-reference to keep documentation consistent with the actual diagrams.`;
}
