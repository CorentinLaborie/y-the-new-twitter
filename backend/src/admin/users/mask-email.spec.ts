import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps the first letter of each part and the last part of the domain (DEC-035)', () => {
    expect(maskEmail('jean@dupont.fr')).toBe('j***@d***.fr');
  });

  it('keeps the whole last label of a longer domain', () => {
    expect(maskEmail('alice@mail.example.test')).toBe('a***@m***.test');
  });

  it('hides the rest of a domain that has no dot', () => {
    expect(maskEmail('x@localhost')).toBe('x***@l***');
  });
});
