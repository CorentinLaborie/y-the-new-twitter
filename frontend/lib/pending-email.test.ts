import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberPendingEmail, takePendingEmail } from './pending-email';

describe('pending e-mail', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('hands the address to the next page, once', () => {
    rememberPendingEmail('alex@exemple.fr');

    expect(takePendingEmail()).toBe('alex@exemple.fr');
    expect(takePendingEmail()).toBeNull();
  });

  it('returns null when nothing was stored', () => {
    expect(takePendingEmail()).toBeNull();
  });

  it('does not throw when storage refuses to save, and the next page starts empty', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(() => rememberPendingEmail('alex@exemple.fr')).not.toThrow();
    expect(takePendingEmail()).toBeNull();
  });

  it('returns null, without throwing, when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(takePendingEmail()).toBeNull();
  });
});
