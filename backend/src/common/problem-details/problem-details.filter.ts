import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { Request, Response } from 'express';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId?: string;
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

    const status = exception instanceof HttpException ? exception.getStatus() : 500;

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
    };

    response.status(status).setHeader('Content-Type', 'application/problem+json').json(body);
  }
}

function messageOf(exception: unknown): string {
  if (!(exception instanceof HttpException)) {
    return 'Unexpected error.';
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
