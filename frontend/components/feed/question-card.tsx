'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConversationRuleDialog } from '@/components/question/conversation-rule-dialog';
import { copyQuestionLink, questionLink } from '@/components/question/copy-link';
import questionStyles from '@/components/question/question.module.css';
import { YMark } from '@/components/brand/y-mark';
import { BookmarkButton } from '@/components/bookmark/bookmark-button';
import { FollowButton } from '@/components/follow/follow-button';
import { BlockDialog } from '@/components/block/block-dialog';
import { ReportDialog } from '@/components/report/report-dialog';
import { REPORT_SENT_MESSAGE } from '@/components/report/report-rules';
import { UnfollowMenuItem } from '@/components/follow/unfollow-menu-item';
import { hashtagHref } from '@/lib/explore-rules';
import type { FeedQuestion, ReactionKind } from '@/lib/feed-api';
import { avatarInitial } from './avatar-initial';
import { FeedIcon } from './feed-icon';
import { formatPostDate } from './format-date';
import { REACTION_KINDS } from './reaction-rules';
import styles from './feed.module.css';

const REACTION_NAMES: Record<ReactionKind, string> = { like: 'J’aime', dislike: 'Pas d’accord', y: 'Y' };

type QuestionCardProps = {
  question: FeedQuestion;
  /** A reaction call of this question is in flight: its reactions are off until the answer comes. */
  reactionPending: boolean;
  /** The message of a reaction that failed and was rolled back, shown under the reactions. */
  reactionError: string | null;
  onReact: (kind: ReactionKind) => void;
  /** Number of replies of the question (F1). Optional until the feed sends it: without it the card shows "Aucune réponse". */
  replyCount?: number;
  /** Opens the conversation under the card (the parent does it). Without it the reply count is shown without action. */
  onOpenConversation?: () => void;
  /** Whether the conversation under the card is open: sets aria-expanded on the reply count (with onOpenConversation). */
  conversationOpen?: boolean;
  /** The signed-in viewer. Without it the card shows no follow control; their own questions show none either. */
  viewer?: { handle: string; suspended: boolean };
  /** Called when the viewer stops following the author from this card (the "Abonnements" tab drops their questions). */
  onAuthorUnfollowed?: () => void;
  /** Called with the new save state from this card (the saved list drops a question once it is unsaved). */
  onBookmarkChange?: (saved: boolean) => void;
};

function ReactionGlyph({ kind }: { kind: ReactionKind }) {
  if (kind === 'y') {
    return <YMark size={14} />;
  }
  return <FeedIcon name={kind === 'like' ? 'thumbs-up' : 'thumbs-down'} size={15} />;
}

function replyLabel(count: number): string {
  if (count === 0) {
    return 'Aucune réponse';
  }
  return count === 1 ? '1 réponse' : `${count} réponses`;
}

/** Icons of the question boards that the other icon sets do not have (paths of the design system). */
function CardIcon({ children, size }: { children: ReactNode; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/**
 * Card of one question in the feed: author (display name and handle), date, hashtags, text, the reactions with their
 * counts (one per user, R11), the Y progress "49/50" (R3) with its 50 Y information button, marked as reached once the
 * conversation is open, the reply count (F1) and the card menu with "Copier le lien" (F11).
 */
export function QuestionCard({
  question,
  reactionPending,
  reactionError,
  onReact,
  replyCount = 0,
  onOpenConversation,
  conversationOpen: conversationShown = false,
  viewer,
  onAuthorUnfollowed,
  onBookmarkChange,
}: QuestionCardProps) {
  const { counters, yThreshold, conversationOpen, viewerReactions } = question;
  const [followed, setFollowed] = useState(question.author.viewerFollows);
  const showFollow = viewer !== undefined && viewer.handle !== question.author.handle;

  function changeFollow(next: boolean) {
    setFollowed(next);
    if (!next) {
      onAuthorUnfollowed?.();
    }
  }
  const [ruleOpen, setRuleOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  // Once the author is blocked, the card leaves the list (plan L6, section 8): it is not rendered any more.
  const [blocked, setBlocked] = useState(false);
  // Another account's question offers the report and the block to an active viewer (plan L6, DEC-035, DEC-104).
  const canReport = viewer !== undefined && !viewer.suspended && viewer.handle !== question.author.handle;
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // While the menu is open: a click outside or Escape closes it (Escape gives the focus back to its button).
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && menuWrapRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  async function copyLink() {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
    const copied = await copyQuestionLink(questionLink(window.location.origin, question.id));
    setCopyStatus(copied ? 'copied' : 'failed');
  }

  if (blocked) {
    return null;
  }

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <span className={`${styles.avatar} ${styles.cardAvatar}`} aria-hidden="true">
          {avatarInitial(question.author.displayName)}
        </span>
        <div className={styles.who}>
          <span className={styles.name}>{question.author.displayName}</span>
          <span className={styles.meta}>
            @{question.author.handle} ·{' '}
            <time dateTime={question.createdAt}>{formatPostDate(question.createdAt)}</time>
          </span>
        </div>
        {showFollow && viewer ? (
          <FollowButton
            handle={question.author.handle}
            initialFollows={followed}
            disabled={viewer.suspended}
            onChange={changeFollow}
          />
        ) : null}
        {question.hashtags.length > 0 ? (
          <div className={styles.tags}>
            {question.hashtags.map((hashtag) => (
              <Link key={hashtag} href={hashtagHref(hashtag)} className={styles.tagLink}>
                #{hashtag}
              </Link>
            ))}
          </div>
        ) : null}
        <div className={questionStyles.menuWrap} ref={menuWrapRef}>
          <button
            ref={menuButtonRef}
            type="button"
            className={questionStyles.menuButton}
            aria-label="Plus d’options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <CardIcon size={18}>
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </CardIcon>
          </button>
          {menuOpen ? (
            <div role="menu" aria-label="Options de la question" className={questionStyles.menu}>
              <button type="button" role="menuitem" className={questionStyles.menuItem} onClick={copyLink}>
                <CardIcon size={16}>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </CardIcon>
                Copier le lien
              </button>
              {canReport ? (
                <button
                  type="button"
                  role="menuitem"
                  className={questionStyles.menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    setReportOpen(true);
                  }}
                >
                  Signaler
                </button>
              ) : null}
              {canReport ? (
                <button
                  type="button"
                  role="menuitem"
                  className={questionStyles.menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    setBlockOpen(true);
                  }}
                >
                  Bloquer @{question.author.handle}
                </button>
              ) : null}
              {showFollow && viewer && !viewer.suspended ? (
                <UnfollowMenuItem
                  handle={question.author.handle}
                  follows={followed}
                  onUnfollowed={() => changeFollow(false)}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      {reportNotice ? (
        <p role="status" className="y-dialog-text">
          {reportNotice}
        </p>
      ) : null}
      {canReport && reportOpen ? (
        <ReportDialog
          open={reportOpen}
          kind="question"
          target={{ questionId: question.id }}
          onClose={() => setReportOpen(false)}
          onSent={() => {
            setReportOpen(false);
            setReportNotice(REPORT_SENT_MESSAGE);
          }}
        />
      ) : null}
      {canReport && blockOpen ? (
        <BlockDialog
          open={blockOpen}
          handle={question.author.handle}
          onClose={() => setBlockOpen(false)}
          onBlocked={() => {
            setBlockOpen(false);
            setBlocked(true);
          }}
        />
      ) : null}
      <p className={styles.body}>{question.text}</p>
      <div className={styles.reactions} role="group" aria-label="Réactions">
        {REACTION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={styles.reaction}
            data-kind={kind}
            aria-pressed={viewerReactions.includes(kind)}
            aria-disabled={reactionPending || undefined}
            onClick={() => {
              if (!reactionPending) {
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
        <span className={questionStyles.yGroup}>
          <span className={`y-progress ${styles.progress}`}>
            {counters.y}/{yThreshold}
            {conversationOpen ? <span className={styles.reached}> · atteint</span> : null}
          </span>
          <button
            type="button"
            className={questionStyles.infoButton}
            aria-label={`En savoir plus sur les ${yThreshold} Y`}
            onClick={(event) => {
              // Focus the button before the dialog opens, so that focus comes back here when it closes.
              event.currentTarget.focus();
              setRuleOpen(true);
            }}
          >
            <CardIcon size={16}>
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </CardIcon>
          </button>
        </span>
      </div>
      <div className={questionStyles.replyRow}>
        {onOpenConversation ? (
          <button
            type="button"
            className={questionStyles.replyCount}
            aria-expanded={conversationShown}
            onClick={onOpenConversation}
          >
            {replyLabel(replyCount)}
          </button>
        ) : (
          <span className={questionStyles.replyCount}>{replyLabel(replyCount)}</span>
        )}
        {viewer ? (
          <BookmarkButton
            questionId={question.id}
            initialSaved={question.viewerSaved}
            disabled={viewer.suspended}
            onChange={onBookmarkChange}
          />
        ) : null}
      </div>
      {reactionError ? (
        <p role="alert" className={styles.reactionError}>
          {reactionError}
        </p>
      ) : null}
      <p
        role="status"
        className={`${questionStyles.status} ${copyStatus === 'failed' ? questionStyles.statusFailed : ''}`}
      >
        {copyStatus === 'copied'
          ? 'Lien copié.'
          : copyStatus === 'failed'
            ? 'Impossible de copier le lien.'
            : ''}
      </p>
      <ConversationRuleDialog open={ruleOpen} yThreshold={yThreshold} onClose={() => setRuleOpen(false)} />
    </article>
  );
}
