import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle, parseReport, type D1Like, type Env } from './index';

const URL_ = 'https://reports.erdbuilderpro.com/v1/desktop-error';
const report = { app_version: '3.5.0', os: 'macos', arch: 'x86_64', event: 'server-stopped', step: 'exit', exit_code: 137 };

// D1 runs SQLite, so the real schema and upsert run here against an in-memory database.
function sqliteEnv(limited = false): { env: Env; rows: () => unknown[] } {
  const db = new Database(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB: D1Like = {
    prepare: (query) => ({ bind: (...values) => ({ first: async <T>() => (db.prepare(query).get(...values) as T) ?? null }) }),
  };
  const env: Env = {
    DB,
    LIMITER: { limit: async () => ({ success: !limited }) },
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_CHAT_ID: 'chat-id',
  };
  return { env, rows: () => db.prepare('SELECT * FROM daily_reports').all() };
}

async function post(env: Env, body: unknown, day = '2026-11-14T08:00:00Z') {
  const pending: Promise<unknown>[] = [];
  const response = await handle(
    new Request(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
    env,
    { waitUntil: (promise) => pending.push(promise) },
    new Date(day),
  );
  await Promise.all(pending);
  return response;
}

describe('Desktop error report Worker (OPS-010)', () => {
  const telegram = vi.fn();
  beforeEach(() => {
    telegram.mockReset().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', telegram);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('counts reports per day and tells Telegram only the first time a combination shows up', async () => {
    const { env, rows } = sqliteEnv();
    expect((await post(env, report)).status).toBe(202);
    expect((await post(env, report)).status).toBe(202);
    expect(telegram).toHaveBeenCalledTimes(1);
    expect(telegram.mock.calls[0][0]).toBe('https://api.telegram.org/botbot-token/sendMessage');
    expect(JSON.parse(telegram.mock.calls[0][1].body)).toEqual({
      chat_id: 'chat-id',
      text: 'ERD Builder Pro Desktop · new error report\n3.5.0 · macos x86_64\nserver-stopped · exit · code 137\nFirst report on 2026-11-14 (UTC)',
    });

    await post(env, { ...report, exit_code: null, event: 'server-failed', step: 'timeout' });
    await post(env, report, '2026-11-15T01:00:00Z');
    expect(telegram).toHaveBeenCalledTimes(3);
    expect(rows()).toEqual([
      { day: '2026-11-14', app_version: '3.5.0', os: 'macos', arch: 'x86_64', event: 'server-stopped', step: 'exit', exit_code: '137', count: 2 },
      { day: '2026-11-14', app_version: '3.5.0', os: 'macos', arch: 'x86_64', event: 'server-failed', step: 'timeout', exit_code: '', count: 1 },
      { day: '2026-11-15', app_version: '3.5.0', os: 'macos', arch: 'x86_64', event: 'server-stopped', step: 'exit', exit_code: '137', count: 1 },
    ]);
  });

  it('rejects anything outside the contract and stores nothing', async () => {
    const { env, rows } = sqliteEnv();
    for (const body of [
      { ...report, path: '/Users/someone/project' },
      { ...report, step: 'timeout' },
      { ...report, app_version: 'unknown' },
      { ...report, exit_code: 1.5 },
      'not json',
    ]) {
      expect((await post(env, body)).status).toBe(400);
    }
    expect((await post(env, { ...report, app_version: '3.5.0-'.padEnd(3000, 'x') })).status).toBe(413);
    expect(rows()).toEqual([]);
    expect(telegram).not.toHaveBeenCalled();
  });

  it('answers 429 when the rate limit is reached', async () => {
    const { env, rows } = sqliteEnv(true);
    expect((await post(env, report)).status).toBe(429);
    expect(rows()).toEqual([]);
  });

  it('allows the app window to call it cross-origin', async () => {
    const { env } = sqliteEnv();
    const preflight = await handle(new Request(URL_, { method: 'OPTIONS' }), env, { waitUntil: () => {} });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect((await handle(new Request('https://reports.erdbuilderpro.com/'), env, { waitUntil: () => {} })).status).toBe(404);
  });

  it('accepts Windows exit codes and Unix signals', () => {
    expect(parseReport({ ...report, os: 'windows', exit_code: 3221225477 })).not.toBeNull();
    expect(parseReport({ ...report, exit_code: -1 })).not.toBeNull();
  });
});
