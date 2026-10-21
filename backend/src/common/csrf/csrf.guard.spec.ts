import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CSRF_HEADER, CsrfGuard, csrfCookieName } from './csrf.guard';

const PUBLIC = 'https://y.corentin-laborie.com';
const ADMIN = 'https://admin-y.corentin-laborie.com';

function configFor(profile: string): ConfigService {
  return new ConfigService({ NODE_ENV: profile, APP_PUBLIC_URL: PUBLIC, ADMIN_PUBLIC_URL: ADMIN });
}

function contextFor(method: string, headers: Record<string, string> = {}) {
  const cookie = jest.fn();
  const request = { method, headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ cookie }) }),
  } as unknown as ExecutionContext;

  return { context, cookie };
}

/** The body the guard puts in the refusal, read back from the exception it throws. */
function refusalOf(guard: CsrfGuard, context: ExecutionContext): unknown {
  try {
    guard.canActivate(context);
  } catch (error) {
    return (error as ForbiddenException).getResponse();
  }
  throw new Error('the guard let the request through');
}

describe('CsrfGuard in local', () => {
  const guard = new CsrfGuard(configFor('local'));

  it('sets the token cookie under the plain name on a safe request that has none', () => {
    const { context, cookie } = contextFor('GET');

    expect(guard.canActivate(context)).toBe(true);
    expect(cookie).toHaveBeenCalledWith(
      'y_csrf',
      expect.any(String),
      expect.objectContaining({ sameSite: 'lax', path: '/', secure: false }),
    );
  });

  it('refuses a mutation without the header, with the French message and the csrf_invalid code', () => {
    const { context } = contextFor('POST', { cookie: 'y_csrf=abc' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Jeton de sécurité absent ou invalide.');
    expect(refusalOf(guard, context)).toEqual({
      message: 'Jeton de sécurité absent ou invalide.',
      code: 'csrf_invalid',
    });
  });

  it('refuses a mutation whose header does not match the cookie, with the same body', () => {
    const { context } = contextFor('POST', { cookie: 'y_csrf=abc', [CSRF_HEADER]: 'xyz' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(refusalOf(guard, context)).toEqual({
      message: 'Jeton de sécurité absent ou invalide.',
      code: 'csrf_invalid',
    });
  });

  it('accepts a mutation whose header matches the cookie', () => {
    const { context } = contextFor('DELETE', {
      cookie: 'theme=dark; y_csrf=abc',
      [CSRF_HEADER]: 'abc',
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});

describe('CsrfGuard outside local', () => {
  const guard = new CsrfGuard(configFor('production'));

  it('uses the __Host- prefix and a Secure cookie', () => {
    const { context, cookie } = contextFor('GET');

    guard.canActivate(context);
    expect(cookie).toHaveBeenCalledWith(
      '__Host-y_csrf',
      expect.any(String),
      expect.objectContaining({ secure: true, path: '/' }),
    );
  });

  it('accepts a matching token sent from the public or the back-office origin', () => {
    for (const origin of [PUBLIC, ADMIN]) {
      const { context } = contextFor('POST', {
        cookie: '__Host-y_csrf=abc',
        [CSRF_HEADER]: 'abc',
        origin,
      });

      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('refuses a matching token sent from another origin, such as a sibling subdomain', () => {
    const { context } = contextFor('POST', {
      cookie: '__Host-y_csrf=abc',
      [CSRF_HEADER]: 'abc',
      origin: 'https://other.corentin-laborie.com',
    });

    expect(refusalOf(guard, context)).toEqual({
      message: 'Jeton de sécurité absent ou invalide.',
      code: 'csrf_invalid',
    });
  });

  it('refuses the opaque null origin', () => {
    const { context } = contextFor('POST', { cookie: '__Host-y_csrf=abc', [CSRF_HEADER]: 'abc', origin: 'null' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('still checks the token when the request carries no Origin header', () => {
    const { context } = contextFor('POST', { cookie: '__Host-y_csrf=abc', [CSRF_HEADER]: 'abc' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('ignores the plain cookie name outside local', () => {
    const { context } = contextFor('POST', { cookie: 'y_csrf=abc', [CSRF_HEADER]: 'abc' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

describe('csrfCookieName', () => {
  it('keeps the plain name for local and uses the prefix for every other profile', () => {
    expect(csrfCookieName('local')).toBe('y_csrf');
    expect(csrfCookieName('staging')).toBe('__Host-y_csrf');
    expect(csrfCookieName('production')).toBe('__Host-y_csrf');
  });
});
