import pino from 'pino';
import PinoHttp from 'pino-http';
import { randomUUID } from 'crypto';

const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const isDev = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
const isMcpStdio = process.env.ERDBPRO_MCP_STDIO === '1';

const logLevel = process.env.LOG_LEVEL || (isVercel ? 'info' : 'debug');

export const logger = isMcpStdio
  ? pino({ level: logLevel }, pino.destination(2))
  : isDev
  ? pino({ level: logLevel }, pino.transport({
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
  : pino({ level: logLevel });

export const httpLogger = PinoHttp({
  logger,
  // Never serialize request headers: Authorization and cookies contain live credentials.
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.socket?.remoteAddress,
      remotePort: req.socket?.remotePort,
    }),
  },
  autoLogging: {
    ignore: (req) => !req.url?.startsWith('/api/'),
  },
  genReqId: () => randomUUID(),
  customReceivedMessage: (req) => `← ${req.method} ${req.url}`,
  customSuccessMessage: (req, res) => `${res.statusCode} ${req.method} ${req.url}`,
  customErrorMessage: (req, res, err) => `${res.statusCode} ${req.method} ${req.url} — ${err.message}`,
  customProps: (req) => ({
    user: (req as any).user?.id || 'anon',
  }),
});
