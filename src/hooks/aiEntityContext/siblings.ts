import { supabase } from '@/lib/supabase';

export async function fetchSiblings(
  currentType: string,
  currentUid: string,
  projectId: number | string | null,
) {
  if (!projectId) return [];

  const results: { type: string; title: string; uid: string }[] = [];

  const queries = [
    { table: 'notes', type: 'note', titleCol: 'title', uidCol: 'uid' },
    { table: 'diagrams', type: 'diagram', titleCol: 'name', uidCol: 'uid' },
    { table: 'drawings', type: 'drawing', titleCol: 'title', uidCol: 'uid' },
    { table: 'flowcharts', type: 'flowchart', titleCol: 'title', uidCol: 'uid' },
  ] as const;

  for (const q of queries) {
    const { data } = await supabase
      .from(q.table)
      .select(`${q.titleCol}, ${q.uidCol}`)
      .eq('project_id', projectId)
      .eq('is_deleted', false);

    if (data) {
      for (const row of data) {
        const uid = (row as any)[q.uidCol];
        if (uid === currentUid) continue;
        results.push({
          type: q.type,
          title: (row as any)[q.titleCol] || '(untitled)',
          uid,
        });
      }
    }
  }

  return results;
}
