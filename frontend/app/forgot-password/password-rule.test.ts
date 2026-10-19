import { describe, expect, it } from 'vitest';
import { passwordProblem } from './password-rule';

describe('passwordProblem', () => {
  it('accepts a password with 8 characters, a digit and a special character', () => {
    expect(passwordProblem('abcdef1!')).toBeNull();
  });

  it('refuses a password shorter than 8 characters, even when it has both', () => {
    expect(passwordProblem('a1!')).toBe('Le mot de passe doit contenir au moins 8 caractères.');
  });

  it('refuses a password longer than 128 characters', () => {
    expect(passwordProblem(`${'a1!'.repeat(50)}`)).toBe(
      'Le mot de passe ne doit pas dépasser 128 caractères.',
    );
  });

  it('refuses a password without a digit', () => {
    expect(passwordProblem('abcdefg!')).toBe('Le mot de passe doit contenir au moins un chiffre.');
  });

  it('refuses a password without a special character', () => {
    expect(passwordProblem('abcdefg1')).toBe('Le mot de passe doit contenir au moins un caractère spécial.');
  });

  it('does not count a space as a special character', () => {
    expect(passwordProblem('abcdefg1 ')).toBe('Le mot de passe doit contenir au moins un caractère spécial.');
  });

  it('reports the length rule before the character rules', () => {
    expect(passwordProblem('')).toBe('Le mot de passe doit contenir au moins 8 caractères.');
  });
});
