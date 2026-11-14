// Desktop error reports (OPS-010). Contract: erd-builder-pro-architecture contracts/desktop-error-report.md.
// Stores only daily counts and tells the owner on Telegram the first time a combination shows up that day.

/** The part of the D1 binding this Worker uses; a plain SQLite shim satisfies it in tests. */
export interface D1Like {
  prepare(query: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null> } };
}

export interface Env {
  DB: D1Like;
  /** Cloudflare rate limiting binding; when it is missing the Worker does not limit. */
  LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

export interface DesktopErrorReport {
  app_version: string;
  os: 'macos' | 'windows' | 'linux';
  arch: 'x86_64' | 'aarch64' | 'x86' | 'arm';
  event: 'server-failed' | 'server-stopped' | 'update-failed';
  step: 'spawn' | 'exit' | 'timeout' | 'download' | 'install';
  exit_code: number | null;
}

const MAX_BODY_BYTES = 2048;
const FIELDS = ['app_version', 'os', 'arch', 'event', 'step', 'exit_code'];
const OS = ['macos', 'windows', 'linux'];
const ARCH = ['x86_64', 'aarch64', 'x86', 'arm'];
const STEPS: Record<string, string[]> = {
  'server-failed': ['spawn', 'exit', 'timeout'],
  'server-stopped': ['exit'],
  'update-failed': ['download', 'install'],
};
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/** Returns the report when it has exactly the allowed fields and values, otherwise null. */
export function parseReport(value: unknown): DesktopErrorReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== FIELDS.length || !FIELDS.every((field) => keys.includes(field))) return null;
  const { app_version, os, arch, event, step, exit_code } = body;
  if (typeof app_version !== 'string' || app_version.length > 32 || !VERSION.test(app_version)) return null;
  if (typeof os !== 'string' || !OS.includes(os)) return null;
  if (typeof arch !== 'string' || !ARCH.includes(arch)) return null;
  if (typeof event !== 'string' || typeof step !== 'string' || !STEPS[event]?.includes(step)) return null;
  // Windows exit codes are unsigned 32-bit (0xC0000005); Unix signals arrive as 128 + signal.
  if (exit_code !== null && (!Number.isInteger(exit_code) || (exit_code as number) < -2147483648 || (exit_code as number) > 4294967295)) return null;
  return body as unknown as DesktopErrorReport;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** Adds one to today's count for this combination and returns the new count. */
async function count(db: D1Like, day: string, report: DesktopErrorReport): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO daily_reports (day, app_version, os, arch, event, step, exit_code, count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT (day, app_version, os, arch, event, step, exit_code) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(day, report.app_version, report.os, report.arch, report.event, report.step, report.exit_code === null ? '' : String(report.exit_code))
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export function telegramText(day: string, report: DesktopErrorReport): string {
  const code = report.exit_code === null ? '' : ` · code ${report.exit_code}`;
  return [
    'ERD Builder Pro Desktop · new error report',
    `${report.app_version} · ${report.os} ${report.arch}`,
    `${report.event} · ${report.step}${code}`,
    `First report on ${day} (UTC)`,
  ].join('\n');
}

async function notify(env: Env, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  if (!response.ok) console.error('Telegram sendMessage failed', response.status);
}

export async function handle(request: Request, env: Env, ctx: Context, now = new Date()): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname !== '/v1/desktop-error') return json(404, { error: 'not_found' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // The address is only a rate-limit key; it is never stored.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) return json(429, { error: 'rate_limited' });

  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return json(413, { error: 'too_large' });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: 'too_large' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'invalid_report' });
  }
  const report = parseReport(body);
  if (!report) return json(400, { error: 'invalid_report' });

  const day = now.toISOString().slice(0, 10);
  if ((await count(env.DB, day, report)) === 1) ctx.waitUntil(notify(env, telegramText(day, report)));
  return json(202, { status: 'accepted' });
}

export default {
  fetch: (request: Request, env: Env, ctx: Context) => handle(request, env, ctx),
};
