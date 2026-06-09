import { apiFetch } from '@/lib/api';
import { EntityContextData } from './types';

export async function fetchDrawing(uid: string) {
  try {
    const res = await apiFetch(`/api/drawings/${uid}`);
    if (!res.ok) return null;
    const data = await res.json();

    let elementsSummary = '(no elements)';
    try {
      const elements = JSON.parse(data.data || '[]');
      if (Array.isArray(elements) && elements.length > 0) {
        const names = elements
          .map((e: any) => e.name || e.text || e.type || 'element')
          .filter(Boolean);
        elementsSummary = names.length > 0
          ? names.slice(0, 30).join(', ')
          : `${elements.length} elements`;
      }
    } catch {
      elementsSummary = '(binary or unparseable data)';
    }

    return {
      title: data.title,
      projectId: data.project_id,
      summary: `Title: ${data.title}\nElements: ${elementsSummary}`,
    };
  } catch {
    return null;
  }
}

export function buildDrawingContext(data: EntityContextData): string | null {
  return `[Current file info]
You are currently viewing this drawing:
Title: ${data.title || '(untitled)'}`;
}
