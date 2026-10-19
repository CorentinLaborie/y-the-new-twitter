import { describe, expect, it } from 'vitest';
import { afterLoginPath, isProtectedPath, loginRedirectPath, safeNextPath } from './route-guard';

describe('isProtectedPath', () => {
  it('protects the routes of the protected area and their sub-paths', () => {
    expect(isProtectedPath('/accueil')).toBe(true);
    expect(isProtectedPath('/accueil/details')).toBe(true);
  });

  it('does not protect public pages, including names that only start the same way', () => {
    expect(isProtectedPath('/')).toBe(false);
    expect(isProtectedPath('/login')).toBe(false);
    expect(isProtectedPath('/forgot-password')).toBe(false);
    expect(isProtectedPath('/accueil-bis')).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('keeps a relative path of the protected area, with its query string', () => {
    expect(safeNextPath('/accueil')).toBe('/accueil');
    expect(safeNextPath('/accueil/details?tab=2')).toBe('/accueil/details?tab=2');
  });

  it.each([
    ['an absolute URL', 'https://example.com/accueil'],
    ['a protocol-relative URL', '//example.com/accueil'],
    ['a backslash trick', '/\\example.com/accueil'],
    ['a path with a control character', '/accueil\n'],
    ['a relative path without a leading slash', 'accueil'],
    ['a public page', '/login'],
    ['the root', '/'],
    ['an empty value', ''],
  ])('refuses %s', (_label, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it('refuses a missing value and an overlong one', () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(`/accueil?${'a'.repeat(2100)}`)).toBeNull();
  });
});

describe('loginRedirectPath', () => {
  it('sends a guest to /login and keeps the requested protected page as next', () => {
    expect(loginRedirectPath('/accueil')).toBe('/login?next=%2Faccueil');
  });

  it('sends a guest to /login without next when the requested path is unknown or unsafe', () => {
    expect(loginRedirectPath(null)).toBe('/login');
    expect(loginRedirectPath('https://example.com')).toBe('/login');
    expect(loginRedirectPath('/login')).toBe('/login');
  });
});

describe('afterLoginPath', () => {
  it('returns to the requested protected page', () => {
    expect(afterLoginPath('/accueil?x=1')).toBe('/accueil?x=1');
  });

  it('falls back to the home page of the protected area for any other value', () => {
    expect(afterLoginPath(null)).toBe('/accueil');
    expect(afterLoginPath('https://example.com/accueil')).toBe('/accueil');
    expect(afterLoginPath('/forgot-password')).toBe('/accueil');
  });
});
