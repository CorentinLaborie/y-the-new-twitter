export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * The contract every e-mail sender follows. Codes, security e-mails and the daily digest go through it.
 * The production sender (Brevo, DEC-018) is set up with its step, after the Brevo account exists (DEC-110).
 */
export interface MailSender {
  send(mail: OutgoingMail): Promise<void>;
}

export const MAIL_SENDER = Symbol('MAIL_SENDER');
