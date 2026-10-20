import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';

/**
 * The Helmet security headers, run as Nest middleware (DEC-213), so that an error raised while setting them is answered
 * as Problem Details, like the session errors.
 */
@Injectable()
export class HelmetMiddleware implements NestMiddleware {
  private readonly handler: RequestHandler = helmet();

  use(req: Request, res: Response, next: NextFunction): void {
    this.handler(req, res, next);
  }
}
