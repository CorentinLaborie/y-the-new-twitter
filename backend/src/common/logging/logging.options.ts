import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Params } from 'nestjs-pino';

/**
 * JSON logs with a request ID on every line. Bodies are never logged. Cookies, authorization
 * headers and any code or e-mail field are redacted if they ever reach a log line.
 */
export const loggingOptions: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    serializers: {
      req: (req: IncomingMessage & { id?: string; method?: string; url?: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url?.split('?')[0],
      }),
    },
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.password',
        '*.code',
        '*.email',
      ],
      censor: '[redacted]',
    },
  },
};
