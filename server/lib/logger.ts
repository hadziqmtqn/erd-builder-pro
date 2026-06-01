import pino from 'pino';
import PinoHttp from 'pino-http';
import { randomUUID } from 'crypto';

const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const isDev = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;

const logLevel = process.env.LOG_LEVEL || (isVercel ? 'info' : 'debug');

export const logger = isDev
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
