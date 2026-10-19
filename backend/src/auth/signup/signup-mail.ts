import type { OutgoingMail } from '../../common/mail/mail-sender';

/** The e-mail that carries the signup code. The text is in French (product language). */
export function signupCodeMail(to: string, code: string, ttlMinutes: number): OutgoingMail {
  return {
    to,
    subject: 'Votre code de vérification Y',
    text: [
      'Bonjour,',
      '',
      `Votre code de vérification Y est : ${code}`,
      `Il est valable ${ttlMinutes} minutes et ne fonctionne qu'une seule fois.`,
      'Si vous avez demandé plusieurs codes, seul le plus récent fonctionne.',
      '',
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
      '',
      "L'équipe Y",
    ].join('\n'),
  };
}
