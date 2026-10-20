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
 * The feed has no question yet (Home-Empty boards). The board's "Explorer" action is left out: its page is a later
 * milestone (M4), and a link to a missing page would be a 404.
 */
export function FeedEmpty() {
  return (
    <div className="y-empty">
      <span className="y-empty-icon">
        <FeedIcon name="message-circle" size={28} />
      </span>
      <h2>Rien à lire pour l’instant</h2>
      <p>Posez la première question ou explorez les tendances.</p>
    </div>
  );
}

/** A load failed (Home-Error boards). The retry control is a real button. */
export function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="y-errorstate" role="alert">
      <span className="y-errorstate-icon">
        <FeedIcon name="triangle-alert" size={24} />
      </span>
      <h2 className="y-errorstate-title">Impossible de charger le fil</h2>
      <p className="y-errorstate-message">Vérifiez votre connexion, puis réessayez.</p>
      <button type="button" className="y-errorstate-retry" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  );
}
