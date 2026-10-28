import { useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * Calls `onChange` when the server signals that the file at `path` was saved (BUG-023).
 * Uses fetch rather than EventSource so the request carries the Team header like every other file call.
 * A reconnect after a dropped stream also calls `onChange`, because a save may have happened while disconnected.
 */
export function useFileChanges(path: string | null, onChange: () => void) {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let retry = 0;
    let dropped = false;
    void (async () => {
      while (!controller.signal.aborted) {
        try {
          const response = await apiFetch(path, { signal: controller.signal, headers: { Accept: 'text/event-stream' } });
          if ([401, 403, 404].includes(response.status)) return;
          if (!response.ok || !response.body) throw new Error('stream unavailable');
          if (dropped) latest.current();
          dropped = false; retry = 0;
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';
          for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            const events = (buffer + chunk.value).split('\n\n');
            buffer = events.pop() ?? '';
            if (events.some(event => event.startsWith('event: change'))) latest.current();
          }
        } catch {
          if (controller.signal.aborted) return;
          dropped = true;
        }
        await new Promise(resolve => setTimeout(resolve, dropped ? Math.min(30_000, 1_000 * 2 ** retry++) : 0));
      }
    })();
    return () => controller.abort();
  }, [path]);
}
