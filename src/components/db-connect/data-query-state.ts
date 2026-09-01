import type { EditorView } from '@codemirror/view';

export type QueryTab = {
  key: string;
  id: number | null;
  groupName: string;
  name: string;
  script: string;
  result: { columns: string[]; rows: any[]; durationMs?: number } | null;
  resultPage: number;
  error: string | null;
};

export const emptyQueryState = { tabs: [] as QueryTab[], activeKey: '' };

const queryCaches = new Map<string, any[]>();
export const getQueryCache = (key: string) => queryCaches.get(key);
export const setQueryCache = (key: string, queries: any[]) => { queryCaches.set(key, queries); return queries; };

export const newQueryTab = (table?: string | null): QueryTab => ({ key: crypto.randomUUID(), id: null, groupName: 'Ungrouped', name: 'New SQL Query', script: `SELECT *\nFROM ${table || ''}`, result: null, resultPage: 1, error: null });

export const beautifySql = (sql: string) => sql
  .replace(/\s+/g, ' ')
  .replace(/\s*,\s*/g, ',\n  ')
  .replace(/\s+(SELECT|FROM|WHERE|LEFT JOIN|RIGHT JOIN|INNER JOIN|JOIN|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|VALUES|SET)\b/gi, '\n$1')
  .replace(/\b(SELECT|FROM|WHERE|LEFT JOIN|RIGHT JOIN|INNER JOIN|JOIN|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|VALUES|SET|AND|OR|ON|AS)\b/gi, word => word.toUpperCase())
  .trim();

export const sqlToRun = (sql: string, from: number, to: number) => {
  const selected = sql.slice(from, to).trim();
  if (selected) return selected;

  const start = sql.lastIndexOf(';', Math.max(0, from - 1)) + 1;
  const end = sql.indexOf(';', from);
  const current = sql.slice(start, end === -1 ? undefined : end).trim();
  if (current) return current;

  const previousEnd = Math.max(0, start - 1);
  const previousStart = sql.lastIndexOf(';', Math.max(0, previousEnd - 1)) + 1;
  return sql.slice(previousStart, previousEnd).trim() || sql.trim();
};

export const runnableSql = (view: EditorView | null, fallback: string) => {
  if (!view) return fallback;
  const { from, to } = view.state.selection.main;
  return sqlToRun(view.state.doc.toString(), from, to);
};

export const reconcileLiveTab = (tab: QueryTab | null, live: QueryTab | null) =>
  tab && live?.key === tab.key ? { ...tab, script: live.script } : tab;

export const readQueryState = (storageKey: string): { tabs: QueryTab[]; activeKey: string } => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    const tabs = Array.isArray(saved.tabs) ? saved.tabs.filter((tab: any) => tab?.key).map((tab: QueryTab) => ({ ...tab, result: null, resultPage: 1, error: null })) : [];
    if (tabs.length) return { tabs, activeKey: tabs.some((tab: QueryTab) => tab.key === saved.activeKey) ? saved.activeKey : tabs[0].key };
  } catch {}
  return emptyQueryState;
};

export const sanitizeQueryState = (value: any): { tabs: QueryTab[]; activeKey: string } | null => {
  const tabs = Array.isArray(value?.tabs) ? value.tabs.filter((tab: any) => tab?.key).map((tab: QueryTab) => ({ ...tab, result: null, resultPage: tab.resultPage || 1, error: null })) : [];
  if (!tabs.length) return null;
  return { tabs, activeKey: tabs.some((tab: QueryTab) => tab.key === value.activeKey) ? value.activeKey : tabs[0].key };
};
