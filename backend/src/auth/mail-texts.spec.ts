import { addressChangedMail, newAddressCodeMail } from './email-change/email-change-mail';
import { passwordChangedMail, resetCodeMail } from './password-reset/password-reset-mail';
import { signupCodeMail } from './signup/signup-mail';

const TO = 'alice@example.test';
const CODE = '482913';

/** B23: the account e-mails are in French, carry the code and its validity, and are signed by the team. */
describe('Account e-mail texts (B23)', () => {
  const codeMails = [
    ['signup code', signupCodeMail(TO, CODE, 15)],
    ['password reset code', resetCodeMail(TO, CODE, 15)],
    ['new address code', newAddressCodeMail(TO, CODE, 15)],
  ] as const;

  const notices = [
    ['password changed', passwordChangedMail(TO)],
    ['address changed', addressChangedMail(TO)],
  ] as const;

  it.each(codeMails)('%s: sent to the address, with the code and its validity in minutes', (_name, mail) => {
    expect(mail.to).toBe(TO);
    expect(mail.text).toContain(CODE);
    expect(mail.text).toContain('15 minutes');
    expect(mail.text).toContain('Bonjour');
  });

  it.each([...codeMails, ...notices])('%s: French subject and text, signed by the team', (_name, mail) => {
    expect(mail.text.startsWith('Bonjour')).toBe(true);
    expect(mail.text).toMatch(/équipe Y/);
    expect(mail.subject).not.toMatch(/^(Your|Hello|Welcome)/);
    expect(mail.subject.length).toBeGreaterThan(0);
  });

  it.each(notices)('%s: says what happened, without a code', (_name, mail) => {
    expect(mail.text).not.toMatch(/\d{6}/);
    expect(mail.text).toMatch(/modifi/);
  });
});
