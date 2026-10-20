import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import session from 'express-session';
import { SESSION_LIFETIME_MS, SessionStore } from './session.store';

/**
 * The express-session middleware, run as Nest middleware (DEC-213). An error of the session store (for example, the
 * database is down) goes to the exception layer, so it is answered as Problem Details. As Express middleware, it would
 * answer with Express's default error page.
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  private readonly handler: RequestHandler;

  constructor(config: ConfigService, store: SessionStore) {
    this.handler = session({
      name: 'SESSION',
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.get<string>('NODE_ENV') !== 'local',
        maxAge: SESSION_LIFETIME_MS,
        path: '/',
      },
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.handler(req, res, next);
  }
}
