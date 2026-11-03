import { describe, expect, it } from 'vitest';
import { firstErrorField, hasErrors, normalizeEmail, toIsoBirthDate, validateCode, validateEmail, validateLogin, validateSignup, type SignupValues } from './validation';

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


describe('birth date (18 years minimum, R7)', () => {
  it('converts JJ/MM/AAAA to YYYY-MM-DD', () => {
    expect(toIsoBirthDate('1/2/1990')).toBe('1990-02-01');
    expect(toIsoBirthDate('31/12/2000')).toBe('2000-12-31');
  });


  it('rejects text that is not a real calendar date', () => {
    expect(toIsoBirthDate('1990/02/01')).toBeNull();
    expect(toIsoBirthDate('1990-02-31')).toBeNull();
    expect(toIsoBirthDate('31/02/1990')).toBeNull();
    expect(toIsoBirthDate('29/02/2001')).toBeNull();
  });


});


describe('terms and code', () => {

  it('accepts exactly six digits', () => {
    expect(validateCode('648125')).toBeUndefined();
    expect(validateCode(' 648125 ')).toBeUndefined();
    expect(validateCode('')).toBe('Saisissez le code reçu par e-mail.');
    expect(validateCode('64812')).toBe('Le code contient 6 chiffres.');
    expect(validateCode('64812a')).toBe('Le code contient 6 chiffres.');
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
