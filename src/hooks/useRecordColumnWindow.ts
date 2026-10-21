import { useLayoutEffect, useRef, useState } from 'react';
import { recordColumnWindow, type ColumnWindow } from '@/lib/record-column-window';

export function useRecordColumnWindow(widths: number[], selectionWidth: number) {
  const [element, scrollRef] = useState<HTMLDivElement | null>(null);
  const [window, setWindow] = useState<ColumnWindow>(() => ({ start: 0, end: Math.min(12, widths.length) }));
  const current = useRef(window);
  useLayoutEffect(() => {
    if (!element) return;
    let frame: number | null = null;
    const update = (force = false) => {
      const visible = recordColumnWindow(widths, element.scrollLeft, element.clientWidth, selectionWidth, 0);
      // Scrolling inside the buffered range stays entirely native, without a React update per pixel.
      if (!force && visible.start >= current.current.start && visible.end <= current.current.end) return;
      const next = recordColumnWindow(widths, element.scrollLeft, element.clientWidth, selectionWidth);
      if (next.start === current.current.start && next.end === current.current.end) return;
      current.current = next;
      setWindow(next);
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; update(); });
    };
    update(true);
    element.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(() => update(true));
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [widths, selectionWidth, element]);
  return { scrollRef, columnWindow: window };
}
