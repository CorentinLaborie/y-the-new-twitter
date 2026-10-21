import type { OutgoingMail } from '../common/mail/mail-sender';

/**
 * The link that starts the set-up of the second factor, sent after a correct password on an account without one. The
 * text is in French (product language).
 */
export function adminSetupMail(to: string, link: string): OutgoingMail {
  return {
    to,
    subject: 'Configuration de la double authentification de l’administration Y',
    text: [
      'Bonjour,',
      '',
      'Une connexion à l’administration Y a été demandée avec votre mot de passe, et votre compte n’a pas encore de double authentification.',
      '',
      `Pour la configurer, ouvrez ce lien dans les 15 minutes : ${link}`,
      '',
      'Si vous n’êtes pas à l’origine de cette demande, changez votre mot de passe sans attendre.',
      '',
      'L’équipe Y',
    ].join('\n'),
  };
}
