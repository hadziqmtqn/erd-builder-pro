import pino from 'pino';
import PinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config({ quiet: process.env.ERDBPRO_MCP_STDIO === '1' });

const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const isDev = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
const isMcpStdio = process.env.ERDBPRO_MCP_STDIO === '1';

const logLevel = process.env.LOG_LEVEL || (isVercel ? 'info' : 'debug');
const service = process.env.LOG_SERVICE || 'cloud-runtime';
const environment = process.env.LOG_ENVIRONMENT || process.env.NODE_ENV || 'development';
const version = process.env.APP_VERSION || process.env.npm_package_version || 'unknown';
const REDACTED = '[REDACTED]';

const sensitiveKeys = new Set([
  'password', 'password_confirmation', 'passphrase', 'secret', 'token',
  'access_token', 'refresh_token', 'authorization', 'cookie', 'set_cookie',
  'session', 'session_id', 'otp', 'oauth_code', 'client_secret', 'api_key',
  'private_key', 'public_key', 'encryption_key', 'webhook_secret', 'card',
  'card_number', 'cvv', 'prompt', 'dbml', 'note', 'document', 'content',
  'body', 'payload', 'sql', 'query', 'raw', 'key',
]);

const redactKey = (key: string): boolean => sensitiveKeys.has(
  key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`),
);

export function redactLogText(value: string): string {
  return value
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi, REDACTED)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/((?:password|passphrase|secret|token|access_token|refresh_token|authorization|cookie|api[_-]?key|client[_-]?secret|private[_-]?key|webhook[_-]?secret)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}&]+)/gi, `$1${REDACTED}`)
    .replace(/((?:postgres(?:ql)?|mysql|redis):\/\/[^:\s]+:)[^@\s]+@/gi, `$1${REDACTED}@`);
}

export function redactLogValue(value: unknown, key?: string, seen = new WeakSet<object>()): unknown {
  if (key && redactKey(key)) return REDACTED;
  if (typeof value === 'string') return redactLogText(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      type: value.name,
      message: redactLogText(value.message),
      stack: value.stack ? redactLogText(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) return value.map(item => redactLogValue(item, undefined, seen));

  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactLogValue(childValue, childKey, seen),
    ]),
  );
}

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'password',
  'password_confirmation',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
  'apiKey',
  'client_secret',
  'clientSecret',
  'private_key',
  'privateKey',
  'webhook_secret',
  'webhookSecret',
  'prompt',
  'dbml',
  'content',
  'document',
  'payload',
  'sql',
  'query',
  'key',
];

const loggerOptions = {
  level: logLevel,
  messageKey: 'message',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  base: {
    service,
    environment,
    version,
    ...(process.env.LOG_REGION ? { region: process.env.LOG_REGION } : {}),
  },
  formatters: {
    level: (label: string) => ({ level: label }),
    log: (object: Record<string, unknown>) => redactLogValue(object) as Record<string, unknown>,
  },
  redact: { paths: redactPaths, censor: REDACTED },
};

export function requestIdFromHeader(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : randomUUID();
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = requestIdFromHeader(req.headers['x-request-id']);
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

const requestPath = (url: string | undefined): string => url?.split('?')[0] || '/';

export const logger = isMcpStdio
  ? pino(loggerOptions, pino.destination(2))
  : isDev
  ? pino(loggerOptions, pino.transport({
      targets: [
        {
          target: 'pino/file',
          options: { destination: './logs/server.log', mkdir: true, append: true },
        },
        {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        },
      ],
    }))
  : pino(loggerOptions);

export const httpLogger = PinoHttp({
  logger,
  // Never serialize request headers: Authorization and cookies contain live credentials.
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: requestPath(req.url),
      remoteAddress: req.socket?.remoteAddress,
      remotePort: req.socket?.remotePort,
    }),
  },
  autoLogging: {
    ignore: (req) => !req.url?.startsWith('/api/'),
  },
  genReqId: (req) => requestIdFromHeader(req.headers['x-request-id']),
  customReceivedMessage: (req) => `← ${req.method} ${requestPath(req.url)}`,
  customSuccessMessage: (req, res) => `${res.statusCode} ${req.method} ${requestPath(req.url)}`,
  customErrorMessage: (req, res) => `${res.statusCode} ${req.method} ${requestPath(req.url)} — request failed`,
  customProps: (req) => ({
    request_id: req.id,
    user_id: (req as any).user?.id || null,
  }),
});
