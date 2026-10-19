import type { OutgoingMail } from '../../common/mail/mail-sender';

/** Sent at once (R18). The code is only in this message: it is never logged or stored in clear. */
export function resetCodeMail(to: string, code: string, ttlMinutes: number): OutgoingMail {
  return {
    to,
    subject: 'Réinitialisation de votre mot de passe Y',
    text: [
      'Bonjour,',
      '',
      `Votre code de réinitialisation est : ${code}`,
      '',
      `Saisissez-le avec votre nouveau mot de passe. Il est valable ${ttlMinutes} minutes et ne peut être utilisé qu’une seule fois.`,
      '',
      'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.',
      '',
      'L’équipe Y',
    ].join('\n'),
  };
}

/** Sent at once to the account address after a password change (R18). */
export function passwordChangedMail(to: string): OutgoingMail {
  return {
    to,
    subject: 'Votre mot de passe Y a été modifié',
    text: [
      'Bonjour,',
      '',
      'Le mot de passe de votre compte Y vient d’être modifié. Toutes vos sessions ont été fermées.',
      '',
      'Si vous n’êtes pas à l’origine de cette modification, réinitialisez votre mot de passe sans attendre.',
      '',
      'L’équipe Y',
    ].join('\n'),
  };
}
