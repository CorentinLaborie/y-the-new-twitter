import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CsrfGuard } from './csrf.guard';

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





});

