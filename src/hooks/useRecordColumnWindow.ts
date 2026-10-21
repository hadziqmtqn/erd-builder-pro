import { useLayoutEffect, useRef, useState } from 'react';
import { recordColumnWindow, type ColumnWindow } from '@/lib/record-column-window';

export function useRecordColumnWindow(widths: number[], selectionWidth: number) {
  const [element, scrollRef] = useState<HTMLDivElement | null>(null);
  // Measure in the layout effect before paint instead of mounting 12 throwaway columns first.
  const [window, setWindow] = useState<ColumnWindow>({ start: 0, end: 0 });
  const current = useRef(window);
  useLayoutEffect(() => {
    if (!element) return;
    let frame: number | null = null;
    const update = (force = false) => {
      const buffer = Math.min(400, Math.max(200, element.clientWidth / 2));
      // Refill before the buffer runs out, so newly visible cells are already mounted.
      const ahead = recordColumnWindow(widths, element.scrollLeft, element.clientWidth, selectionWidth, buffer / 2);
      if (!force && ahead.start >= current.current.start && ahead.end <= current.current.end) return;
      const next = recordColumnWindow(widths, element.scrollLeft, element.clientWidth, selectionWidth, buffer);
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
