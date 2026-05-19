import { supabase } from '@/lib/supabase';
import { EntityContextData } from './types';

export async function fetchDrawing(uid: string) {
  const { data, error } = await supabase
    .from('drawings')
    .select('title, data, project_id')
    .eq('uid', uid)
    .single();

  if (error || !data) return null;

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
}

export function buildDrawingContext(data: EntityContextData): string | null {
  return `[Current file info]
You are currently viewing this drawing:
Title: ${data.title || '(untitled)'}`;
}
