import { deletionMail } from './status-change-mail';

describe('deletionMail (R16, R18)', () => {
  it('tells the user in French that the account is scheduled for deletion, with the reason and the window', () => {
    const mail = deletionMail('alice@example.test', 'Spam', 90);

    expect(mail.to).toBe('alice@example.test');
    expect(mail.subject).toBe('Votre compte Y est programmé pour suppression');
    expect(mail.text).toContain('Votre compte Y a été programmé pour suppression');
    expect(mail.text).toContain('Motif : Spam');
    expect(mail.text).toContain('supprimé définitivement dans 90 jours');
  });

  it('does not promise that a login cancels the deletion', () => {
    expect(deletionMail('alice@example.test', 'Spam', 90).text).not.toMatch(/annuler|reconnect/);
  });
});
