import type { OutgoingMail } from '../common/mail/mail-sender';

/** The alert sent on every back-office sign-in and on every second-factor set-up. The text is in French (product language). */
export function adminSignInMail(to: string, at: Date): OutgoingMail {
  return {
    to,
    subject: 'Connexion à l’administration Y',
    text: [
      'Bonjour,',
      '',
      `Une connexion à l’administration Y a été réussie le ${at.toISOString()}.`,
      '',
      'Si vous n’êtes pas à l’origine de cette connexion, changez votre mot de passe sans attendre.',
      '',
      'L’équipe Y',
    ].join('\n'),
  };
}
