import Link from 'next/link';
import { YMark } from '@/components/brand/y-mark';
import { avatarInitial } from '@/components/feed/avatar-initial';
import { notificationText } from '@/lib/notification-text';
import type { NotificationView } from '@/lib/notifications-api';
import { relativeTime } from './relative-time';
import styles from './notifications.module.css';

/** Y count at which a question opens its conversation (R3). */
const Y_CONVERSATION_THRESHOLD = 50;

/**
 * One line of the list: the sentence, the question it is about, the time and the unread state. An unread line gets a
 * background, a dot and a visible "Non lue", and its accessible name starts with "Non lue : ". The whole line is the
 * link to the question; a line without question (hidden or deleted) is shown without link.
 */
export function NotificationItem({ line, now }: { line: NotificationView; now: number }) {
  const unread = line.readAt === null;
  const content = (
    <>
      {unread ? (
        <>
          <span className="y-sr">Non lue : </span>{' '}
        </>
      ) : null}
      {line.actor ? (
        <span className={styles.avatar} aria-hidden="true">
          {avatarInitial(line.actor.displayName)}
        </span>
      ) : (
        <span className={styles.avatar} aria-hidden="true">
          <YMark size={18} />
        </span>
      )}
      <span className={styles.body}>
        <span className={styles.sentence}>{notificationText(line, Y_CONVERSATION_THRESHOLD)}</span>
        {line.question ? (
          <>
            {' '}
            <span className={styles.quote}>« {line.question.text} »</span>
          </>
        ) : null}{' '}
        <span className={styles.meta}>
          <time dateTime={line.createdAt}>{relativeTime(line.createdAt, now)}</time>
          {unread ? (
            <span className={styles.unreadLabel} aria-hidden="true">
              Non lue
            </span>
          ) : null}
        </span>
      </span>
      {unread ? <span className={styles.dot} aria-hidden="true" /> : null}
    </>
  );

  return (
    <li className={unread ? `${styles.item} ${styles.unread}` : styles.item}>
      {line.question ? (
        <Link href={`/questions/${line.question.id}`} className={styles.link}>
          {content}
        </Link>
      ) : (
        <div className={styles.link}>{content}</div>
      )}
    </li>
  );
}
