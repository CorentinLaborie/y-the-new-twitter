import type { OutgoingMail } from '../../common/mail/mail-sender';

/** Sent to the new address, which must prove it is reachable (R18). The code is never logged. */
export function newAddressCodeMail(to: string, code: string, ttlMinutes: number): OutgoingMail {
  return {
    to,
    subject: 'Confirmez votre nouvelle adresse e-mail Y',
    text: [
      'Bonjour,',
      '',
      `Votre code de confirmation est : ${code}`,
      '',
      `Saisissez-le dans Y pour utiliser cette adresse. Il est valable ${ttlMinutes} minutes et ne peut être utilisé qu’une seule fois.`,
      '',
      'Si vous n’avez pas demandé ce changement, ignorez ce message : votre adresse reste inchangée.',
      '',
      'L’équipe Y',
    ].join('\n'),
  };
}

/** Sent to the former address, after the switch (R18). */
export function addressChangedMail(to: string): OutgoingMail {
  return {
    to,
    subject: 'Votre adresse e-mail Y a été modifiée',
    text: [
      'Bonjour,',
      '',
      'L’adresse e-mail de votre compte Y vient d’être modifiée. Les messages de sécurité ne seront plus envoyés à cette adresse.',
      '',
      'Si vous n’êtes pas à l’origine de ce changement, contactez-nous sans attendre.',
      '',
      'L’équipe Y',
    ].join('\n'),
  };
}
