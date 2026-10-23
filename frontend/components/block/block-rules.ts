/** The texts of the block dialog and of the list of blocked accounts (plan L6, section 7; the proposals validated by the owner). */

export function blockTitle(handle: string): string {
  return `Bloquer @${handle} ?`;
}

/** The explanation of the block dialog: the account is not told, and it can be lifted from the settings. */
export function blockDescription(handle: string): string {
  return `@${handle} ne pourra plus voir vos publications ni vous contacter. Ce compte ne sera pas prévenu. Vous pourrez le débloquer depuis Paramètres, dans Comptes bloqués.`;
}

/** The sentence about follows, validated by the owner: the follows between the two accounts are removed (R14). */
export const BLOCK_FOLLOWS_NOTE = 'Vos abonnements réciproques seront retirés.';

export function blockedMessage(handle: string): string {
  return `@${handle} est bloqué.`;
}

export const BLOCK_FAILED_MESSAGE = 'Le blocage n’a pas pu être enregistré. Réessayez.';

export const BLOCK_NOT_FOUND_MESSAGE = 'Ce compte est introuvable.';

export const UNBLOCK_FAILED_MESSAGE = 'Le compte n’a pas pu être débloqué. Réessayez.';

export function unblockedMessage(handle: string): string {
  return `@${handle} est débloqué.`;
}

export const BLOCKED_EMPTY_MESSAGE = 'Vous n’avez bloqué aucun compte.';
