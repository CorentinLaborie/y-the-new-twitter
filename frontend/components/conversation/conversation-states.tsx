import { FeedIcon } from '@/components/feed/feed-icon';
import feedStyles from '@/components/feed/feed.module.css';

const SKELETON_ROW_COUNT = 3;

/**
 * Under 50 Y (or whatever the threshold is): the conversation is closed, with the current Y count and the Y still
 * missing (never negative).
 */
export function ConversationClosed({ yCount, yThreshold }: { yCount: number; yThreshold: number }) {
  const missing = Math.max(0, yThreshold - yCount);
  return (
    <div className={feedStyles.closed}>
      <h3 className={feedStyles.closedTitle}>Réponses fermées pour cette question</h3>
      <p className={feedStyles.meta}>Les réponses s’ouvrent à {yThreshold} Y.</p>
      <p className={feedStyles.meta}>Il manque encore {missing} Y.</p>
      <span className="y-progress">
        {yCount} / {yThreshold} Y
      </span>
    </div>
  );
}

/** First load of the replies: skeleton rows, in a busy region (Reply-Loading boards). */
export function RepliesLoading() {
  return (
    <div role="status" aria-label="Chargement des réponses…" aria-busy="true" className={feedStyles.list}>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <div key={index} className="y-skeleton-card">
          <div className="y-skeleton-head">
            <span className="y-skeleton-block y-skeleton-avatar" aria-hidden="true" />
            <div className="y-skeleton-lines">
              <span className="y-skeleton-block y-skeleton-line is-short" aria-hidden="true" />
              <span className="y-skeleton-block y-skeleton-line" aria-hidden="true" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The first page of replies failed (Replies-LoadError boards). The retry control is a real button. */
export function RepliesError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="y-errorstate" role="alert">
      <span className="y-errorstate-icon">
        <FeedIcon name="triangle-alert" size={24} />
      </span>
      <h3 className="y-errorstate-title">Impossible de charger les réponses</h3>
      <p className="y-errorstate-message">{message}</p>
      <button type="button" className="y-errorstate-retry" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  );
}
