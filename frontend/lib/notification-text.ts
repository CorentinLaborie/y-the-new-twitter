import type { NotificationView } from '@/lib/notifications-api';

/** The reaction kinds as the page names them (the labels of the Y reactions). */
const REACTION_LABEL = {
  reaction_like: 'J’aime',
  reaction_dislike: 'Pas d’accord',
  reaction_y: 'Y',
} as const;

/**
 * The sentence of a line (section 6.2 of the L2 plan). One sentence per type. A grouped reaction names the actor and
 * counts the others; a line without actor (a system notice) names nobody.
 */
export function notificationText(line: NotificationView, threshold: number): string {
  const name = line.actor?.displayName ?? 'Quelqu’un';
  const others = line.actorCount - 1;
  switch (line.type) {
    case 'reply_to_question':
      return `${name} a répondu à votre question`;
    case 'conversation_opened':
      return `Votre question a atteint ${threshold} Y : la conversation est ouverte`;
    case 'reaction_like':
    case 'reaction_dislike':
    case 'reaction_y': {
      // The reaction name is quoted, so « J’aime » does not read as part of the sentence.
      const kind = `« ${REACTION_LABEL[line.type]} »`;
      if (others <= 0) {
        return `${name} a réagi ${kind} à votre question`;
      }
      return `${name} et ${others} ${others === 1 ? 'autre' : 'autres'} ont réagi ${kind} à votre question`;
    }
    case 'follow':
      return `${name} vous suit`;
    case 'mention':
      return `${name} vous a mentionné`;
  }
}
