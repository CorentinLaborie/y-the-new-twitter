import type { ApiProblem } from '@/lib/api-client';
import { messageForCode } from '@/lib/api-messages';
import type { NotificationTab } from '@/lib/notifications-api';
import { FeedIcon } from '@/components/feed/feed-icon';
import styles from './notifications.module.css';

const SKELETON_ROWS = 5;

/** Advice shown when the connection or the server fails. */
export const CONNECTION_FAILURE_MESSAGE = 'Vérifiez votre connexion, puis réessayez.';

/** Message of a refusal: the French text of its code, otherwise the connection advice. */
export function notificationsFailureMessage(problem: ApiProblem): string {
  return messageForCode(problem) ?? CONNECTION_FAILURE_MESSAGE;
}

/** Bell of the empty state (the shared icon set has no bell). Decorative: the title names the state. */
function BellIcon() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** First load of the list: skeleton rows in a busy region, with a text for screen readers. */
export function NotificationsLoading() {
  return (
    <div aria-busy="true" className={styles.list}>
      <span className="y-sr">Chargement des notifications…</span>
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className={styles.skeletonRow} aria-hidden="true">
          <span className="y-skeleton-block y-skeleton-avatar" />
          <div className={styles.skeletonLines}>
            <span className="y-skeleton-block y-skeleton-line is-short" />
            <span className="y-skeleton-block y-skeleton-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The list has no line for the tab. No action (plan 6.5): the text tells when lines will come. */
export function NotificationsEmpty({ tab }: { tab: NotificationTab }) {
  return (
    <div className="y-empty">
      <span className="y-empty-icon">
        <BellIcon />
      </span>
      <h2>Aucune notification</h2>
      <p>
        {tab === 'mention'
          ? 'Les mentions de votre pseudo dans les questions et les réponses apparaîtront ici.'
          : 'Vos notifications apparaîtront ici.'}
      </p>
    </div>
  );
}

/** The first page did not load. The retry control is a real button. */
export function NotificationsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="y-errorstate" role="alert">
      <span className="y-errorstate-icon">
        <FeedIcon name="triangle-alert" size={24} />
      </span>
      <h2 className="y-errorstate-title">Impossible de charger les notifications</h2>
      <p className="y-errorstate-message">{message}</p>
      <button type="button" className="y-errorstate-retry" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  );
}
