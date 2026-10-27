import Link from 'next/link';
import type { ApiProblem } from '@/lib/api-client';
import { messageForCode } from '@/lib/api-messages';
import { FeedIcon } from './feed-icon';
import styles from './feed.module.css';

const SKELETON_COUNT = 3;

function SkeletonCard() {
  return (
    <div className="y-skeleton-card" role="status" aria-label="Chargement…">
      <div className="y-skeleton-head">
        <span className="y-skeleton-block y-skeleton-avatar" aria-hidden="true" />
        <div className="y-skeleton-lines">
          <span className="y-skeleton-block y-skeleton-line is-short" aria-hidden="true" />
          <span className="y-skeleton-block y-skeleton-line" aria-hidden="true" />
        </div>
      </div>
      <span className="y-skeleton-block y-skeleton-line" aria-hidden="true" />
    </div>
  );
}

/** First load of the feed: skeleton cards, in a busy region (Home-Loading boards). */
export function FeedLoading() {
  return (
    <div aria-busy="true" className={styles.list}>
      {Array.from({ length: SKELETON_COUNT }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

/**
 * The feed has no question yet (Home-Empty boards). The "Explorer" action leads to /explore, which exists since M4
 * (DEC-168, restored on 2026-10-27).
 */
export function FeedEmpty() {
  return (
    <div className="y-empty">
      <span className="y-empty-icon">
        <FeedIcon name="message-circle" size={28} />
      </span>
      <h2>Rien à lire pour l’instant</h2>
      <p>Posez la première question ou explorez les tendances.</p>
      <Link href="/explore" className="y-btn y-btn-outline y-btn-md y-btn-pill">
        Explorer
      </Link>
    </div>
  );
}

/**
 * The "Abonnements" tab has no question yet: an account followed with no question, or none of them. The "Explorer"
 * action leads to /explore (DEC-168, restored on 2026-10-27).
 */
export function FollowingEmpty() {
  return (
    <div className="y-empty">
      <span className="y-empty-icon">
        <FeedIcon name="message-circle" size={28} />
      </span>
      <h2>Rien à lire pour l’instant</h2>
      <p>Les questions des comptes que vous suivez apparaîtront ici.</p>
      <Link href="/explore" className="y-btn y-btn-outline y-btn-md y-btn-pill">
        Explorer
      </Link>
    </div>
  );
}

/** A load failed (Home-Error boards). The retry control is a real button. */
export function FeedError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="y-errorstate" role="alert">
      <span className="y-errorstate-icon">
        <FeedIcon name="triangle-alert" size={24} />
      </span>
      <h2 className="y-errorstate-title">Impossible de charger le fil</h2>
      <p className="y-errorstate-message">{message}</p>
      <button type="button" className="y-errorstate-retry" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  );
}

/** Message of a feed that could not be loaded, for the error state. */
export const CONNECTION_FAILURE_MESSAGE = 'Vérifiez votre connexion, puis réessayez.';

/**
 * A refusal with a known code (an account that is not active, a CSRF refusal) shows its French text from the code.
 * Otherwise a 403 on the feed shows the API message (the account is suspended or pending deletion, and the API sends
 * the French text for it). Other failures get the connection advice.
 */
export function feedFailureMessage(problem: ApiProblem): string {
  return messageForCode(problem) ?? (problem.status === 403 ? problem.detail : CONNECTION_FAILURE_MESSAGE);
}
