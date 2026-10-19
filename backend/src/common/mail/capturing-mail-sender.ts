import { MailSender, OutgoingMail } from './mail-sender';

/**
 * Test adapter (DEC-073): records the messages instead of sending them. It never calls Brevo,
 * and it refuses to run in production, so a real message can never be swallowed by it.
 */
export class CapturingMailSender implements MailSender {
  private readonly outbox: OutgoingMail[] = [];

  async send(mail: OutgoingMail): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('The capturing mail sender cannot run in production.');
    }

    this.outbox.push({ ...mail });
  }

  /** The messages recorded so far, oldest first. The list is a copy. */
  messages(): OutgoingMail[] {
    return this.outbox.map((mail) => ({ ...mail }));
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
