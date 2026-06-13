import { useState, useEffect, useCallback } from 'react';

export interface ColumnDef {
  id: string;
  label: string;
  defaultVisible: boolean;
  hideable: boolean;
  width: string;
}

export function useColumnVisibility(storageKey: string, defaults: ColumnDef[]) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return { ...JSON.parse(saved) };
    } catch {}
    return Object.fromEntries(defaults.map(c => [c.id, c.defaultVisible]));
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(visible)); } catch {}
  }, [visible, storageKey]);

  const toggle = useCallback((colId: string) => {
    setVisible(prev => ({ ...prev, [colId]: !prev[colId] }));
  }, []);

  const visibleCols = useCallback(
    () => defaults.filter(c => !c.hideable || (visible[c.id] ?? c.defaultVisible)),
    [visible]
  );

  return { visible, toggle, visibleCols };
}
