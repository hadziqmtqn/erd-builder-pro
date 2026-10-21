import { useCallback, useLayoutEffect, useRef, useState } from 'react';

type Listener = (entry: IntersectionObserverEntry) => void;
const roots = new WeakMap<Element, { observer: IntersectionObserver; listeners: Map<Element, Listener> }>();

export function observeRecordRow(row: HTMLTableRowElement, listener: Listener) {
  const root = row.closest('[data-records-scroll]');
  if (!root || typeof IntersectionObserver === 'undefined') return () => {};
  let group = roots.get(root);
  if (!group) {
    const listeners = new Map<Element, Listener>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) listeners.get(entry.target)?.(entry);
    }, { root, rootMargin: '160px 0px' });
    group = { observer, listeners };
    roots.set(root, group);
  }
  group.listeners.set(row, listener);
  group.observer.observe(row);
  return () => {
    group.listeners.delete(row);
    group.observer.unobserve(row);
    if (group.listeners.size === 0) {
      group.observer.disconnect();
      roots.delete(root);
    }
  };
}

export function useRecordRowVisibility() {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [visibility, setVisibility] = useState({ visible: true, height: 0 });
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    return observeRecordRow(row, entry => {
      const height = entry.boundingClientRect.height;
      if (height <= 0 || (!entry.isIntersecting && row.contains(row.ownerDocument.activeElement))) return;
      setVisibility(previous => previous.visible === entry.isIntersecting && (entry.isIntersecting || previous.height === height)
        ? previous : { visible: entry.isIntersecting, height });
    });
  }, []);
  const reveal = useCallback(() => setVisibility(previous => previous.visible ? previous : { ...previous, visible: true }), []);
  return { rowRef, ...visibility, reveal };
}
