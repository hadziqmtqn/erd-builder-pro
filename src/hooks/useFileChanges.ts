import { useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';

type FileChangeHandlers = {
  onChange: () => void;
  onAccess?: () => void;
  /** The version of the open file this client already knows, its own saves included; null when unknown. */
  knownVersion?: () => Promise<number | null>;
};

/** The version in the stream's `ready` event, or null when the server sent none. */
function readyVersion(event: string): number | null {
  try {
    const version = JSON.parse(event.split('\ndata: ')[1] ?? 'null')?.version;
    return Number.isInteger(version) ? version : null;
  } catch {
    return null;
  }
}

/**
 * Follows the file change stream at `path` until `signal` aborts (BUG-023). A save may have happened while the stream
 * was down, so a reconnect calls `onChange` when the server's version is newer than the one this client knows, or when
 * either is unknown. A reconnect at the same version stays quiet (BUG-077).
 */
export async function watchFileChanges(path: string, handlers: FileChangeHandlers, signal: AbortSignal): Promise<void> {
  let retry = 0;
  let dropped = false;
  while (!signal.aborted) {
    try {
      const response = await apiFetch(path, { signal, headers: { Accept: 'text/event-stream' } });
      if ([401, 403, 404].includes(response.status)) return;
      if (!response.ok || !response.body) throw new Error('stream unavailable');
      let checkMissedSave = dropped;
      dropped = false; retry = 0;
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        const events = (buffer + chunk.value).split('\n\n');
        buffer = events.pop() ?? '';
        const ready = events.find(event => event.startsWith('event: ready'));
        if (ready && checkMissedSave) {
          checkMissedSave = false;
          const serverVersion = readyVersion(ready);
          void (handlers.knownVersion?.() ?? Promise.resolve(null)).catch(() => null).then(known => {
            if (!signal.aborted && (serverVersion === null || known === null || serverVersion > known)) handlers.onChange();
          });
        }
        if (events.some(event => event.startsWith('event: change'))) handlers.onChange();
        if (events.some(event => event.startsWith('event: access'))) handlers.onAccess?.();
      }
    } catch {
      if (signal.aborted) return;
      dropped = true;
    }
    await new Promise(resolve => setTimeout(resolve, dropped ? Math.min(30_000, 1_000 * 2 ** retry++) : 0));
  }
}

/**
 * Calls `onChange` when someone else saved the file at `path` (BUG-023), and `onAccess` when the user's role on the
 * file's Project changed (BUG-061). Uses fetch rather than EventSource so the request carries the Team header like
 * every other file call. `knownVersion` lets a reconnect skip the signal when nothing was saved meanwhile (BUG-077).
 */
export function useFileChanges(path: string | null, onChange: () => void, onAccess?: () => void, knownVersion?: () => Promise<number | null>) {
  const latest = useRef({ onChange, onAccess, knownVersion });
  latest.current = { onChange, onAccess, knownVersion };
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void watchFileChanges(path, {
      onChange: () => latest.current.onChange(),
      onAccess: () => latest.current.onAccess?.(),
      knownVersion: async () => (await latest.current.knownVersion?.()) ?? null,
    }, controller.signal);
    return () => controller.abort();
  }, [path]);
}
