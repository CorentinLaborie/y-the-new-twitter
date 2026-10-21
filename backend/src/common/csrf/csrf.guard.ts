import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import { allowedOrigins } from '../../config/allowed-origins';

export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The cookie name. Outside local it has the __Host- prefix: a browser then accepts it only when it is Secure, has
 * path / and no Domain attribute, so a sibling subdomain cannot set or overwrite it (the cookie is HTTPS-only there).
 */
export function csrfCookieName(profile: string): string {
  return profile === 'local' ? 'y_csrf' : '__Host-y_csrf';
}

/**
 * Double-submit token: the cookie is set on safe requests, and every other method must send the same value in the
 * X-CSRF-Token header. A mutation whose Origin header is not an allowed site is refused as well. A request with no
 * Origin header (a non-browser client) is checked by the token only. The cookie is not HTTP-only on purpose, because
 * the frontend has to read it to send the header.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly profile: string;
  private readonly cookieName: string;
  private readonly origins: ReadonlySet<string>;

  constructor(config: ConfigService) {
    this.profile = config.getOrThrow<string>('NODE_ENV');
    this.cookieName = csrfCookieName(this.profile);
    this.origins = new Set(allowedOrigins(config));
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const cookieToken = readCookie(request.headers.cookie, this.cookieName);

    if (SAFE_METHODS.has(request.method)) {
      if (!cookieToken) {
        response.cookie(this.cookieName, randomBytes(32).toString('base64url'), {
          httpOnly: false,
          sameSite: 'lax',
          secure: this.profile !== 'local',
          path: '/',
        });
      }
      return true;
    }

    const origin = request.headers.origin;
    const headerToken = request.headers[CSRF_HEADER];
    const originRefused = origin !== undefined && !this.origins.has(origin);
    if (originRefused || !cookieToken || typeof headerToken !== 'string' || !sameToken(cookieToken, headerToken)) {
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
