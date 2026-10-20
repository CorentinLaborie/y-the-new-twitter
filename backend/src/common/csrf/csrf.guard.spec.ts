import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CSRF_COOKIE, CSRF_HEADER, CsrfGuard } from './csrf.guard';

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

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('sets the token cookie on a safe request that has none', () => {
    const { context, cookie } = contextFor('GET');

    expect(guard.canActivate(context)).toBe(true);
    expect(cookie).toHaveBeenCalledWith(
      CSRF_COOKIE,
      expect.any(String),
      expect.objectContaining({ sameSite: 'lax', path: '/' }),
    );
  });

  it('refuses a mutation without the header, with the French message and the csrf_invalid code', () => {
    const { context } = contextFor('POST', { cookie: `${CSRF_COOKIE}=abc` });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Jeton de sécurité absent ou invalide.');
    expect(refusalOf(guard, context)).toEqual({
      message: 'Jeton de sécurité absent ou invalide.',
      code: 'csrf_invalid',
    });
  });

  it('refuses a mutation whose header does not match the cookie, with the same body', () => {
    const { context } = contextFor('POST', { cookie: `${CSRF_COOKIE}=abc`, [CSRF_HEADER]: 'xyz' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(refusalOf(guard, context)).toEqual({
      message: 'Jeton de sécurité absent ou invalide.',
      code: 'csrf_invalid',
    });
  });

  it('accepts a mutation whose header matches the cookie', () => {
    const { context } = contextFor('DELETE', {
      cookie: `theme=dark; ${CSRF_COOKIE}=abc`,
      [CSRF_HEADER]: 'abc',
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
