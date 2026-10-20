import { describe, expect, it } from 'vitest';
import { avatarInitial } from './avatar-initial';

describe('avatarInitial', () => {
  it('gives the first letter in capitals', () => {
    expect(avatarInitial('alice')).toBe('A');
    expect(avatarInitial('élise')).toBe('É');
  });

  it('keeps an emoji at the start of the name whole', () => {
    expect(avatarInitial('🦊 Renard')).toBe('🦊');
  });

  it('gives nothing for an empty name', () => {
    expect(avatarInitial('')).toBe('');
  });
});
