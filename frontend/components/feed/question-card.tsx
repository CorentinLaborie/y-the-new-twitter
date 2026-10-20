import { YMark } from '@/components/brand/y-mark';
import type { FeedQuestion, ReactionKind } from '@/lib/feed-api';
import { FeedIcon } from './feed-icon';
import { formatPostDate } from './format-date';
import { REACTION_KINDS } from './reaction-rules';
import styles from './feed.module.css';

const REACTION_NAMES: Record<ReactionKind, string> = { like: 'J’aime', dislike: 'Pas d’accord', y: 'Y' };

type QuestionCardProps = {
  question: FeedQuestion;
  /** A reaction call of this question is in flight: its reactions are off until the answer comes. */
  busy: boolean;
  /** The message of a reaction that failed and was rolled back, shown under the reactions. */
  reactionError: string | null;
  onReact: (kind: ReactionKind) => void;
};

function ReactionGlyph({ kind }: { kind: ReactionKind }) {
  if (kind === 'y') {
    return <YMark size={14} />;
  }
  return <FeedIcon name={kind === 'like' ? 'thumbs-up' : 'thumbs-down'} size={15} />;
}

/**
 * Card of one question in the feed: author (display name and handle), date, hashtags, text, the reactions with their
 * counts (one per user, R11) and the Y progress "49/50" (R3), marked as reached once the conversation is open.
 */
export function QuestionCard({ question, busy, reactionError, onReact }: QuestionCardProps) {
  const { counters, yThreshold, conversationOpen, viewerReactions } = question;

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <span className={`${styles.avatar} ${styles.cardAvatar}`} aria-hidden="true">
          {question.author.displayName.charAt(0).toUpperCase()}
        </span>
        <div className={styles.who}>
          <span className={styles.name}>{question.author.displayName}</span>
          <span className={styles.meta}>
            @{question.author.handle} ·{' '}
            <time dateTime={question.createdAt}>{formatPostDate(question.createdAt)}</time>
          </span>
        </div>
        {question.hashtags.length > 0 ? (
          <div className={styles.tags}>
            {question.hashtags.map((hashtag) => (
              <span key={hashtag}>#{hashtag}</span>
            ))}
          </div>
        ) : null}
      </header>
      <p className={styles.body}>{question.text}</p>
      <div className={styles.reactions} role="group" aria-label="Réactions">
        {REACTION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={styles.reaction}
            data-kind={kind}
            aria-pressed={viewerReactions.includes(kind)}
            aria-disabled={busy || undefined}
            onClick={() => {
              if (!busy) {
                onReact(kind);
              }
            }}
          >
            <span className={styles.glyph} aria-hidden="true">
              <ReactionGlyph kind={kind} />
            </span>
            <span>{counters[kind]}</span> <span className="y-sr">{REACTION_NAMES[kind]}</span>
          </button>
        ))}
        <span className={`y-progress ${styles.progress}`}>
          {counters.y}/{yThreshold}
          {conversationOpen ? <span className={styles.reached}> · atteint</span> : null}
        </span>
      </div>
      {reactionError ? (
        <p role="alert" className={styles.reactionError}>
          {reactionError}
        </p>
      ) : null}
    </article>
  );
}
