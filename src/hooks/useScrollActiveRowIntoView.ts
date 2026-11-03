import { useEffect, type RefObject } from 'react';

/** Brings the `aria-current` row back into view when a list mounts again, e.g. after leaving an editor. */
export function useScrollActiveRowIntoView(listRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [listRef]);
}
