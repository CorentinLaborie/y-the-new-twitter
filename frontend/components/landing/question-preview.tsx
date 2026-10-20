import type { ReactNode } from 'react';
import { YMark } from '@/components/brand/y-mark';
import { LandingIcon } from './landing-icon';
import styles from './landing.module.css';

/*
 * Question card of the demo (QuestionPost of the design system, design/canvas-build/project/ds/yds/components/bundle.js).
 * It is a picture of the feed for visitors, so it has no working control: the reactions, the follow and save buttons
 * are drawn as they are on the boards, and the whole preview is hidden from assistive technology by its parent.
 */

type Reactions = { like: string; dislike: string; y?: string };

type QuestionPreviewProps = {
  author: string;
  date: string;
  tags: string[];
  body: string;
  reactions: Reactions;
  followed?: boolean;
  /** The Y reaction of the visitor is active (the card is in the conversation). */
  yActive?: boolean;
  /** Shows the save button; `saved` sets its state. */
  bookmark?: { saved: boolean };
  compact?: boolean;
  children?: ReactNode;
};

export function QuestionPreview({
  author,
  date,
  tags,
  body,
  reactions,
  followed = false,
  yActive = false,
  bookmark,
  compact = false,
  children,
}: QuestionPreviewProps) {
  return (
    <article className={['y-qpost', 'has-menu', compact ? 'is-compact' : ''].join(' ').trim()}>
      <header className="y-qpost-head">
        <span className={['y-avatar', styles.avatar].join(' ')}>{author.charAt(0)}</span>
        <div className="y-qpost-who">
          <strong>{author}</strong>
          <span>{date}</span>
        </div>
        <span className={['y-follow', followed ? 'is-followed' : ''].join(' ').trim()}>
          <LandingIcon name="user-plus" size={12} />
          {followed ? 'Suivi !' : 'Suivre'}
        </span>
        <div className="y-qpost-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <span className="y-qpost-more">
          <LandingIcon name="ellipsis" size={18} />
        </span>
      </header>
      <p className="y-qpost-body">{body}</p>
      <div className="y-qpost-actions">
        <span className="y-react y-react-like">
          <LandingIcon name="thumbs-up" size={15} />
          <span>{reactions.like}</span>
        </span>
        <span className="y-react y-react-dislike">
          <LandingIcon name="thumbs-down" size={15} />
          <span>{reactions.dislike}</span>
        </span>
        {reactions.y ? (
          <span className={['y-react', 'y-react-y', yActive ? 'is-active' : ''].join(' ').trim()}>
            <span className="y-logo y-logo-primary">
              <YMark size={14} />
            </span>
            <span>{reactions.y}</span>
          </span>
        ) : null}
        {bookmark ? (
          <span className={['y-save', bookmark.saved ? 'is-saved' : ''].join(' ').trim()}>
            <LandingIcon name={bookmark.saved ? 'bookmark-filled' : 'bookmark'} size={16} />
          </span>
        ) : null}
      </div>
      {children}
    </article>
  );
}

/** Conversation box under a question that reached 50 Y (ConversationBox). Its size follows the breakpoint in CSS. */
export function ConversationPreview({ replyTo, children }: { replyTo: string; children: ReactNode }) {
  return (
    <section className="y-convo">
      <div className="y-convo-head">
        <p className="y-convo-title">Rejoindre la conversation</p>
        <span className="y-convo-report">
          <LandingIcon name="triangle-alert" size={14} />
          <span className={styles.reportWide}>Signaler ce post</span>
          <span className={styles.reportNarrow}>Signaler</span>
        </span>
      </div>
      <div className="y-convo-input">Répondre à {replyTo}…</div>
      {children}
      <span className="y-convo-more">
        <LandingIcon name="plus" size={14} />
        Voir plus de réponses
      </span>
    </section>
  );
}
