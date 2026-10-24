import type { OutgoingMail } from '../../common/mail/mail-sender';

/**
 * The mail sent at the request, to the address the user typed (decision 5). Its text is a proposal: the owner has not
 * validated it yet (plan L5, section 9). It gives the purge date and how to cancel.
 */
export function deletionRequestedMail(to: string, purgeAt: Date): OutgoingMail {
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(purgeAt);

  return {
    to,
    subject: 'Votre demande de suppression de compte Y est enregistrée',
    text: [
      'Bonjour,',
      '',
      'Votre demande de suppression de compte Y est enregistrée.',
      `Votre compte et vos données personnelles seront supprimés le ${date}.`,
      'Pour annuler, reconnectez-vous à votre compte avant cette date.',
      '',
      'Si vous n’êtes pas à l’origine de cette demande, changez votre mot de passe.',
    ].join('\n'),
  };
}
