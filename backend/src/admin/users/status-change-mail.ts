import type { OutgoingMail } from '../../common/mail/mail-sender';

/** The e-mail sent when an account is suspended (R18). The text is in French (product language). */
export function suspensionMail(to: string, reason: string): OutgoingMail {
  return {
    to,
    subject: 'Votre compte Y est suspendu',
    text: [
      'Bonjour,',
      '',
      'Votre compte Y a été suspendu par l’équipe de modération.',
      '',
      `Motif : ${reason}`,
      '',
      'Pendant la suspension, vous ne pouvez plus publier, réagir, répondre ni suivre. Vous pouvez contacter l’administrateur depuis Y.',
      'Pour toute question, contactez-nous à l’adresse indiquée dans les mentions légales.',
      '',
      'L’équipe Y',
    ].join('\n'),
  };
}

/**
 * The e-mail sent when an administrator starts the deletion window of an account (R16, R18). The text is in French.
 * It does not promise that a login cancels the deletion: an administrator's deletion is not cancelled by a login.
 */
export function deletionMail(to: string, reason: string, windowDays: number): OutgoingMail {
  return {
    to,
    subject: 'Votre compte Y est programmé pour suppression',
    text: [
      'Bonjour,',
      '',
      'Votre compte Y a été programmé pour suppression par l’équipe de modération.',
      '',
      `Motif : ${reason}`,
      '',
      `Votre compte sera supprimé définitivement dans ${windowDays} jours.`,
      'Pour toute question, contactez-nous à l’adresse indiquée dans les mentions légales.',
      '',
      'L’équipe Y',
    ].join('\n'),
  };
}

/** The e-mail sent when a suspension is lifted (R18). The text is in French (product language). */
export function reactivationMail(to: string): OutgoingMail {
  return {
    to,
    subject: 'Votre compte Y est de nouveau actif',
    text: [
      'Bonjour,',
      '',
      'La suspension de votre compte Y a été levée. Vous pouvez de nouveau publier, réagir et répondre.',
      '',
      'L’équipe Y',
    ].join('\n'),
  };
}
