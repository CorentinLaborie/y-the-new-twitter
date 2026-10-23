import type { ReportReason } from '@/lib/reports-api';

/** The labels of the six reasons, in the order of the menu (DEC-011). `hate` reads « Propos haineux » (decision 9). */
export const REPORT_REASON_OPTIONS: readonly { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harcèlement' },
  { value: 'hate', label: 'Propos haineux' },
  { value: 'illegal_content', label: 'Contenu illicite' },
  { value: 'misinformation', label: 'Désinformation' },
  { value: 'other', label: 'Autre' },
];

/** The message under the details field when the reason is other and the details are empty (plan L6, section 7). */
export const REPORT_DETAILS_REQUIRED_MESSAGE = 'Précisez le motif pour continuer.';

/** The message of a report that could not be sent, for any answer but a 404 (plan L6, section 7). */
export const REPORT_FAILED_MESSAGE = 'Le signalement n’a pas pu être envoyé. Réessayez.';

/** The message of a report on content that is no longer available (404), with a button that closes the dialog. */
export const REPORT_UNAVAILABLE_MESSAGE = 'Ce contenu n’est plus disponible.';

/** The message announced once a report is sent. */
export const REPORT_SENT_MESSAGE = 'Merci. Votre signalement a été envoyé.';
