import type { OutgoingMail } from '../../common/mail/mail-sender';

/**
 * The e-mail that carries an administrator's answer to a suspended account (DEC-116). The text is in French (product
 * language), and it names the thread by its reference so the account can match it.
 */
export function supportReplyMail(to: string, reference: string, answer: string): OutgoingMail {
  return {
    to,
    subject: 'Réponse de l’équipe Y à votre message',
    text: [
      'Bonjour,',
      '',
      `L’équipe Y répond à votre message (référence ${reference}) :`,
      '',
      answer,
      '',
      'Vous pouvez répondre depuis la page de suspension de votre compte Y.',
      '',
      'L’équipe Y',
    ].join('\n'),
  };
}
