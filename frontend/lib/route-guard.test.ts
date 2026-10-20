import { describe, expect, it } from 'vitest';
import { isProtectedPath, loginRedirectPath, safeNextPath } from './route-guard';

describe('isProtectedPath', () => {
  it('protects the routes of the protected area and their sub-paths', () => {
    expect(isProtectedPath('/home')).toBe(true);
    expect(isProtectedPath('/home/details')).toBe(true);
  });

  it('does not protect public pages, including names that only start the same way', () => {
    expect(isProtectedPath('/')).toBe(false);
    expect(isProtectedPath('/login')).toBe(false);
    expect(isProtectedPath('/forgot-password')).toBe(false);
    expect(isProtectedPath('/home-bis')).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('keeps a relative path of the protected area, with its query string', () => {
    expect(safeNextPath('/home')).toBe('/home');
    expect(safeNextPath('/home/details?tab=2')).toBe('/home/details?tab=2');
  });

  it.each([
    ['an absolute URL', 'https://example.com/home'],
    ['a protocol-relative URL', '//example.com/home'],
    ['a backslash trick', '/\\example.com/home'],
    ['a path with a control character', '/home\n'],
    ['a relative path without a leading slash', 'home'],
    ['a public page', '/login'],
    ['the root', '/'],
    ['an empty value', ''],
  ])('refuses %s', (_label, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it('refuses a missing value and an overlong one', () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(`/home?${'a'.repeat(2100)}`)).toBeNull();
  });
});

describe('loginRedirectPath', () => {
  it('sends a guest to /login with the session-expired reason, and keeps the requested protected page as next', () => {
    expect(loginRedirectPath('/home')).toBe('/login?reason=session-expired&next=%2Fhome');
  });

  it('sends a guest to /login with the reason alone when the requested path is unknown or unsafe', () => {
    expect(loginRedirectPath(null)).toBe('/login?reason=session-expired');
    expect(loginRedirectPath('https://example.com')).toBe('/login?reason=session-expired');
    expect(loginRedirectPath('/login')).toBe('/login?reason=session-expired');
  });

  it('drops next when the requested path has a query string, which may hold personal data', () => {
    expect(loginRedirectPath('/home?handle=alice')).toBe('/login?reason=session-expired');
  });
});
