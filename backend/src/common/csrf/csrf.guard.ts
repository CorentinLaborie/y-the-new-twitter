import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { Request, Response } from 'express';

export const CSRF_COOKIE = 'y_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit token: the cookie is set on safe requests, and every other method must
 * send the same value in the X-CSRF-Token header. The cookie is not HTTP-only on purpose,
 * because the frontend has to read it to send the header.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const cookieToken = readCookie(request.headers.cookie, CSRF_COOKIE);

    if (SAFE_METHODS.has(request.method)) {
      if (!cookieToken) {
        response.cookie(CSRF_COOKIE, randomBytes(32).toString('base64url'), {
          httpOnly: false,
          sameSite: 'lax',
          secure: process.env.NODE_ENV !== 'local',
          path: '/',
        });
      }
      return true;
    }

    const headerToken = request.headers[CSRF_HEADER];
    if (!cookieToken || typeof headerToken !== 'string' || !sameToken(cookieToken, headerToken)) {
      throw new ForbiddenException({
        message: 'Jeton de sécurité absent ou invalide.',
        code: 'csrf_invalid',
      });
    }

    return true;
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1];
}

function sameToken(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
