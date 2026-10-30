import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { Request, Response } from 'express';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId?: string;
  code?: string;
}

/**
 * Turns every error into an RFC 9457 Problem Details response (application/problem+json).
 * Server errors never expose their message to the client.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status = statusOf(exception);

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const body: ProblemDetails = {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      detail: status >= 500 ? 'Unexpected error.' : messageOf(exception),
      instance: request.originalUrl,
      requestId: request.id === undefined ? undefined : String(request.id),
      code: codeOf(exception),
    };

    response.status(status).setHeader('Content-Type', 'application/problem+json').json(body);
  }
}

/**
 * The status of an error. A Nest exception carries its own. A body parser (for example a body above its limit, or
 * malformed JSON) flags its client errors with `status` and `expose`: those keep their 4xx. Anything else is a 500.
 */
function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  const parsed = exception as { status?: unknown; expose?: unknown };
  const isClientError = typeof parsed.status === 'number' && parsed.status >= 400 && parsed.status < 500;
  return isClientError && parsed.expose === true ? (parsed.status as number) : 500;
}

function messageOf(exception: unknown): string {
  if (!(exception instanceof HttpException)) {
    return 'La requête ne peut pas être traitée.';
  }

  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }

  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message.join('; ');
  }

  return typeof message === 'string' ? message : exception.message;
}

/** The stable code of a refusal, when the exception carries one (`{ message, code }`): a RFC 9457 extension member. */
function codeOf(exception: unknown): string | undefined {
  if (!(exception instanceof HttpException)) {
    return undefined;
  }

  const code = (exception.getResponse() as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
