import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchFileChanges } from './useFileChanges';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api')>(), apiFetch }));

const encoder = new TextEncoder();
const ready = (version: number) => `event: ready\ndata: {"version":${version}}\n\n`;

/** A stream that sends `events`, then either drops like a cut tunnel or stays open until the test aborts. */
function sse(events: string[], end: 'drop' | 'open', signal: AbortSignal): Response {
  const queue = events.map(event => encoder.encode(event));
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();
      if (next) return controller.enqueue(next);
      if (end === 'drop') return controller.error(new TypeError('network error'));
      return new Promise<void>(resolve => signal.addEventListener('abort', () => { controller.close(); resolve(); }, { once: true }));
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('file change stream reconnects (BUG-077)', () => {
  afterEach(() => { vi.useRealTimers(); apiFetch.mockReset(); });

  async function reconnect(serverVersion: number, knownVersion: number | null) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const signal = new AbortController();
    apiFetch
      .mockResolvedValueOnce(sse([ready(5)], 'drop', signal.signal))
      .mockResolvedValueOnce(sse([ready(serverVersion)], 'open', signal.signal));
    const onChange = vi.fn();
    void watchFileChanges('/api/diagrams/d1/events', { onChange, knownVersion: async () => knownVersion }, signal.signal);
    await vi.advanceTimersByTimeAsync(1500); // the first retry waits one second
    signal.abort();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    return onChange;
  }

  it('stays quiet when the stream comes back at the version this client knows', async () => {
    expect(await reconnect(5, 5)).not.toHaveBeenCalled();
  });

  it('still signals a save someone made while the stream was down (BUG-023)', async () => {
    expect(await reconnect(6, 5)).toHaveBeenCalledTimes(1);
  });

  it('signals when the known version is unknown, as before', async () => {
    expect(await reconnect(5, null)).toHaveBeenCalledTimes(1);
  });

  it('signals a live save and ignores the ready event of the first connection', async () => {
    const signal = new AbortController();
    apiFetch.mockResolvedValueOnce(sse([ready(5), 'event: change\ndata: {}\n\n'], 'open', signal.signal));
    const onChange = vi.fn();
    const knownVersion = vi.fn(async () => 5);
    void watchFileChanges('/api/notes/n1/events', { onChange, knownVersion }, signal.signal);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    signal.abort();
    expect(knownVersion).not.toHaveBeenCalled();
  });
});
