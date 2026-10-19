import { describe, expect, it } from 'vitest';
import {
  firstErrorField,
  hasErrors,
  normalizeEmail,
  toIsoBirthDate,
  validateBirthDate,
  validateCode,
  validateDisplayName,
  validateEmail,
  validateHandle,
  validateLogin,
  validatePassword,
  validatePasswordConfirmation,
  validatePhone,
  validateSignup,
  validateTerms,
  type SignupValues,
} from './validation';

const TODAY = new Date('2026-10-19T12:00:00Z');

const validSignup: SignupValues = {
  displayName: 'Jeannot Dupont',
  handle: 'Jeannot45',
  birthDate: '01/02/1990',
  email: 'jeannot@exemple.fr',
  phone: '',
  password: 'Secret-42!',
  passwordConfirmation: 'Secret-42!',
  termsAccepted: true,
};

describe('handle', () => {
  it('accepts ASCII letters, digits and underscores up to 30 characters', () => {
    expect(validateHandle('Jeannot_45')).toBeUndefined();
    expect(validateHandle('a'.repeat(30))).toBeUndefined();
  });

  it('rejects an empty handle and one longer than 30 characters', () => {
    expect(validateHandle('')).toBe('Le pseudo est obligatoire.');
    expect(validateHandle('a'.repeat(31))).toBe('Le pseudo ne peut pas dépasser 30 caractères.');
  });

  it('rejects non-ASCII letters, spaces and dashes', () => {
    const message = 'Le pseudo ne contient que des lettres, chiffres et tirets bas.';
    expect(validateHandle('élodie')).toBe(message);
    expect(validateHandle('jean dupont')).toBe(message);
    expect(validateHandle('jean-dupont')).toBe(message);
  });

  it('rejects reserved handles whatever their case', () => {
    expect(validateHandle('admin')).toBe('Ce pseudo est réservé.');
    expect(validateHandle('ADMIN')).toBe('Ce pseudo est réservé.');
    expect(validateHandle('Y')).toBe('Ce pseudo est réservé.');
  });
});

describe('display name', () => {
  it('accepts 1 to 50 characters', () => {
    expect(validateDisplayName('J')).toBeUndefined();
    expect(validateDisplayName('a'.repeat(50))).toBeUndefined();
  });

  it('rejects an empty name and one longer than 50 characters', () => {
    expect(validateDisplayName('')).toBe('Le nom affiché est obligatoire.');
    expect(validateDisplayName('a'.repeat(51))).toBe('50 caractères maximum.');
  });
});

describe('e-mail', () => {
  it('lower-cases and trims the address before checking it', () => {
    expect(normalizeEmail('  Alex@Exemple.FR ')).toBe('alex@exemple.fr');
    expect(validateEmail('  Alex@Exemple.FR ')).toBeUndefined();
  });

  it('rejects an empty address, a malformed one and one longer than 254 characters', () => {
    expect(validateEmail('')).toBe('L’adresse e-mail est obligatoire.');
    expect(validateEmail('alex@')).toBe('Adresse e-mail invalide.');
    expect(validateEmail('alex@exemple')).toBe('Adresse e-mail invalide.');
    expect(validateEmail(`${'a'.repeat(250)}@b.fr`)).toBe('Adresse e-mail invalide.');
  });
});

describe('password (DEC-136)', () => {
  it('accepts a password of 8 characters with a digit and a special character', () => {
    expect(validatePassword('abc123!x')).toBeUndefined();
  });

  it('rejects fewer than 8 characters', () => {
    expect(validatePassword('abc12!')).toBe('8 caractères minimum.');
  });

  it('rejects a password without a digit or without a special character', () => {
    const message = 'Le mot de passe doit contenir au moins un chiffre et un caractère spécial.';
    expect(validatePassword('abcdefg!')).toBe(message);
    expect(validatePassword('abcdefg1')).toBe(message);
    expect(validatePassword('abc 1234')).toBe(message);
  });

  it('accepts 128 characters and rejects 129', () => {
    const base = 'abcdefg1!';
    expect(validatePassword(base + 'x'.repeat(128 - base.length))).toBeUndefined();
    expect(validatePassword(base + 'x'.repeat(129 - base.length))).toBe('128 caractères maximum.');
  });

  it('checks the confirmation against the password', () => {
    expect(validatePasswordConfirmation('abc123!x', 'abc123!x')).toBeUndefined();
    expect(validatePasswordConfirmation('abc123!x', 'abc1234')).toBe(
      'Les mots de passe ne correspondent pas.',
    );
    expect(validatePasswordConfirmation('abc123!x', '')).toBe('Confirmez votre mot de passe.');
  });
});

describe('birth date (18 years minimum, R7)', () => {
  it('converts JJ/MM/AAAA to YYYY-MM-DD', () => {
    expect(toIsoBirthDate('1/2/1990')).toBe('1990-02-01');
    expect(toIsoBirthDate('31/12/2000')).toBe('2000-12-31');
  });

  it('rejects text that is not a real calendar date', () => {
    expect(toIsoBirthDate('1990-02-01')).toBeNull();
    expect(toIsoBirthDate('31/02/1990')).toBeNull();
    expect(toIsoBirthDate('29/02/2001')).toBeNull();
  });

  it('accepts someone who turns 18 today and refuses someone who turns 18 tomorrow', () => {
    expect(validateBirthDate('19/10/2008', TODAY)).toBeUndefined();
    expect(validateBirthDate('20/10/2008', TODAY)).toBe('Vous devez avoir au moins 18 ans.');
  });

  it('gives the format and empty-field messages', () => {
    expect(validateBirthDate('', TODAY)).toBe('La date de naissance est obligatoire.');
    expect(validateBirthDate('1990-02-01', TODAY)).toBe('Date invalide. Utilisez le format JJ/MM/AAAA.');
  });
});

describe('phone (optional, French format)', () => {
  it('accepts an empty field and French numbers with spaces or +33', () => {
    expect(validatePhone('')).toBeUndefined();
    expect(validatePhone('06 12 34 56 78')).toBeUndefined();
    expect(validatePhone('+33 6.12.34.56.78')).toBeUndefined();
  });

  it('rejects a number that is not French', () => {
    expect(validatePhone('12345')).toBe('Numéro de téléphone français invalide.');
    expect(validatePhone('+44 6 12 34 56 78')).toBe('Numéro de téléphone français invalide.');
  });
});

describe('terms and code', () => {
  it('requires the terms to be accepted', () => {
    expect(validateTerms(true)).toBeUndefined();
    expect(validateTerms(false)).toBe('Vous devez accepter les conditions d’utilisation.');
  });

  it('accepts exactly six digits', () => {
    expect(validateCode('648125')).toBeUndefined();
    expect(validateCode(' 648125 ')).toBeUndefined();
    expect(validateCode('')).toBe('Saisissez le code reçu par e-mail.');
    expect(validateCode('64812')).toBe('Le code est composé de 6 chiffres.');
    expect(validateCode('64812a')).toBe('Le code est composé de 6 chiffres.');
  });
});

describe('form validation', () => {
  it('returns no error for a valid signup', () => {
    expect(validateSignup(validSignup, TODAY)).toEqual({});
  });

  it('reports every invalid field of the signup at once', () => {
    const errors = validateSignup(
      { ...validSignup, handle: 'admin', email: 'alex@', termsAccepted: false, passwordConfirmation: 'x' },
      TODAY,
    );

    expect(Object.keys(errors).sort()).toEqual(['email', 'handle', 'passwordConfirmation', 'termsAccepted']);
  });

  it('gives the first invalid field in display order', () => {
    const errors = validateSignup({ ...validSignup, displayName: '', email: 'alex@' }, TODAY);
    const order = ['displayName', 'handle', 'birthDate', 'email'] as const;

    expect(firstErrorField(errors, order)).toBe('displayName');
    expect(firstErrorField({}, order)).toBeUndefined();
  });

  it('checks the login form without applying the password policy', () => {
    expect(validateLogin({ email: 'alex@exemple.fr', password: 'ancien' })).toEqual({});
    expect(validateLogin({ email: 'alex@', password: '' })).toEqual({
      email: 'Adresse e-mail invalide.',
      password: 'Le mot de passe est obligatoire.',
    });
    expect(hasErrors(validateLogin({ email: 'alex@exemple.fr', password: '' }))).toBe(true);
  });
});
