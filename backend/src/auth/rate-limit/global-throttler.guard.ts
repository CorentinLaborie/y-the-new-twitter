import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';

/** Response header that says why a request was not counted: the counter store was unavailable (DEC-212). */
const RATE_LIMIT_ERROR_HEADER = 'X-RateLimit-Error';
const STORE_UNAVAILABLE = 'store-unavailable';

/**
 * The global limit (DEC-212). A request over the limit is refused with 429, as usual. When the counter store is down
 * the request is served, with the header above, and the error is logged: the limit cannot count, but the API keeps
 * answering. The auth limits do not use this guard: they fail closed (DEC-194).
 */
@Injectable()
export class GlobalThrottlerGuard extends ThrottlerGuard {
  private readonly storeLogger = new Logger(GlobalThrottlerGuard.name);

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throw error;
      }

      const { res } = this.getRequestResponse(requestProps.context);
      res.setHeader(RATE_LIMIT_ERROR_HEADER, STORE_UNAVAILABLE);
      this.storeLogger.error(
        'Global rate limit not counted: the counter store is unavailable.',
        error instanceof Error ? error.stack : undefined,
      );
      return true;
    }
  }
}
