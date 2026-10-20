import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  contactMessageLength,
  isContactMessageValid,
  sendContactMessage,
} from './contact-message';

vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));

describe('contact message rules (section 3.4, DEC-078)', () => {
  it('has a limit of 1000 characters', () => {
    expect(CONTACT_MESSAGE_MAX_LENGTH).toBe(1000);
  });

  it('counts the trimmed text, and an emoji as one character', () => {
    expect(contactMessageLength('  ab  ')).toBe(2);
    expect(contactMessageLength('😀')).toBe(1);
  });

  it('accepts 1 and 1000 characters, and refuses an empty text, spaces only and 1001 characters', () => {
    expect(isContactMessageValid('a')).toBe(true);
    expect(isContactMessageValid('a'.repeat(1000))).toBe(true);
    expect(isContactMessageValid('a'.repeat(1001))).toBe(false);
    expect(isContactMessageValid('')).toBe(false);
    expect(isContactMessageValid('   ')).toBe(false);
  });
});

describe('sendContactMessage', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it('posts the trimmed text to /support/messages and returns the reference of the thread', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ok: true,
      status: 201,
      body: { reference: 'CNT-20261019-0001' },
    });

    const result = await sendContactMessage('  Je conteste.  ');

    expect(apiRequest).toHaveBeenCalledWith('POST', '/support/messages', { body: { text: 'Je conteste.' } });
    expect(result).toEqual({ ok: true, reference: 'CNT-20261019-0001' });
  });

  it('returns the problem of a refused send, with its code', async () => {
    const problem = { status: 422, title: 'Unprocessable Entity', detail: 'Trop long.', code: undefined };
    vi.mocked(apiRequest).mockResolvedValue({ ok: false, problem });

    const result = await sendContactMessage('a'.repeat(1001));

    expect(result).toEqual({ ok: false, problem });
  });
});
