import { useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';

/** The Team id carried by a `collaboration` event, or null. */
export function collaborationTeam(event: string): string | null {
  try {
    const teamId = JSON.parse(event.split('\ndata: ')[1] ?? 'null')?.teamId;
    return typeof teamId === 'string' && teamId ? teamId : null;
  } catch {
    return null;
  }
}

/**
 * Calls `onChange` when the server signals that the file at `path` was saved (BUG-023).
 * Uses fetch rather than EventSource so the request carries the Team header like every other file call.
 * A reconnect after a dropped stream also calls `onChange`, because a save may have happened while disconnected.
 * Calls `onAccess` when the user's role on the file's Project changed (BUG-061), and `onCollaboration` with the Team id
 * when someone else changed the file's comments or discussions on Self-host (BUG-079).
 */
export function useFileChanges(path: string | null, onChange: () => void, onAccess?: () => void, onCollaboration?: (teamId: string) => void) {
  const latest = useRef(onChange);
  latest.current = onChange;
  const latestAccess = useRef(onAccess);
  latestAccess.current = onAccess;
  const latestCollaboration = useRef(onCollaboration);
  latestCollaboration.current = onCollaboration;
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
            if (events.some(event => event.startsWith('event: access'))) latestAccess.current?.();
            const collaboration = events.find(event => event.startsWith('event: collaboration'));
            const teamId = collaboration ? collaborationTeam(collaboration) : null;
            if (teamId) latestCollaboration.current?.(teamId);
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
