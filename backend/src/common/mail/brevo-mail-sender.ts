import { MailSender, OutgoingMail } from './mail-sender';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 10_000;

interface BrevoMailSenderOptions {
  apiKey: string;
  fromAddress: string;
  /** Test seam: a fake HTTP client. Production uses the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Production sender (DEC-018): one HTTP call to the Brevo transactional API per message.
 * Errors never carry the message body, the recipient or the API key, so no code can reach the logs.
 */
export class BrevoMailSender implements MailSender {
  constructor(private readonly options: BrevoMailSenderOptions) {}

  async send(mail: OutgoingMail): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': this.options.apiKey,
      },
      body: JSON.stringify({
        sender: { email: this.options.fromAddress },
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
        ...(mail.html === undefined ? {} : { htmlContent: mail.html }),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Brevo refused the message with HTTP ${response.status}.`);
    }
  }
}
