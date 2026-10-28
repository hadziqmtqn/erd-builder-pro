import { useEffect, useState } from 'react';

/** Under this width the fixed sidebar would leave the work area too narrow. */
const NARROW_WINDOW = '(max-width: 1023px)';

/**
 * Controlled open state for the sidebar: it starts collapsed on a narrow window and follows the window when it
 * crosses that width. Opening or closing it by hand is never undone until the window crosses the width again.
 */
export function useAutoCollapseSidebar() {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia(NARROW_WINDOW).matches);

  useEffect(() => {
    const query = window.matchMedia(NARROW_WINDOW);
    const onChange = (event: MediaQueryListEvent) => setOpen(!event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return { open, onOpenChange: setOpen };
}
