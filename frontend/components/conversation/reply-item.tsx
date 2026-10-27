'use client';

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { avatarInitial } from '@/components/feed/avatar-initial';
import { FeedIcon } from '@/components/feed/feed-icon';
import { formatPostDate } from '@/components/feed/format-date';
import styles from '@/components/feed/feed.module.css';
import { ReportDialog } from '@/components/report/report-dialog';
import { REPORT_SENT_MESSAGE } from '@/components/report/report-rules';
import type { ReplyReactionKind, ReplyView } from '@/lib/replies-api';
import { DeleteReplyDialog } from './delete-reply-dialog';
import { MentionText } from './mention-text';

export type ReplyItemProps = {
  reply: ReplyView;
  /** Handle of the signed-in viewer, or null when nobody is signed in. */
  viewerHandle: string | null;
  /** A reaction call of this reply is in flight: its reactions are off until the answer comes. */
  reactionPending: boolean;
  /** Called with the kind clicked; the parent decides whether it adds or removes the reaction. */
  onReact: (kind: ReplyReactionKind) => void;
  /** Called once the viewer has confirmed the deletion of their own reply. */
  onDelete: () => void;
};

/** The two reactions of a reply (F5). Each one is toggled on its own: no kind replaces the other. */
const REACTIONS: ReadonlyArray<{
  kind: ReplyReactionKind;
  label: string;
  icon: 'thumbs-up' | 'thumbs-down';
}> = [
  { kind: 'like', label: 'J’aime', icon: 'thumbs-up' },
  { kind: 'dislike', label: 'Pas d’accord', icon: 'thumbs-down' },
];

/**
 * One reply under a question: author (display name and handle), date, text, the two reactions with their counts, and
 * for the viewer's own reply the ⋯ menu with "Supprimer ma réponse" (F6).
 */
export function ReplyItem({ reply, viewerHandle, reactionPending, onReact, onDelete }: ReplyItemProps) {
  const isOwn = viewerHandle !== null && viewerHandle === reply.author.handle;
  // Another account's reply offers the report (plan L6, DEC-035); the block is only offered from a question and a profile.
  const canReport = viewerHandle !== null && !isOwn;
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const menuId = useId();

  // Opening the menu, by click or by keyboard, moves the focus to its item.
  useEffect(() => {
    if (menuOpen) {
      menuItemRef.current?.focus();
    }
  }, [menuOpen]);

  // Closing the dialog (Annuler or Escape) gives the focus back to the menu button.
  useEffect(() => {
    if (!dialogOpen && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      menuButtonRef.current?.focus();
    }
  }, [dialogOpen]);

  // A pointer press outside the menu closes it.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (!menuWrapRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      closeMenu();
      menuButtonRef.current?.focus();
    }
  }

  function handleMenuBlur(event: FocusEvent<HTMLDivElement>) {
    // Tab out of the menu closes it. A blur without a new target (a click on blank space) is left to the pointer rule.
    const next = event.relatedTarget as Node | null;
    if (next && !event.currentTarget.contains(next)) {
      closeMenu();
    }
  }

  function handleDeleteChosen() {
    setMenuOpen(false);
    setDialogOpen(true);
  }

  function handleReportChosen() {
    setMenuOpen(false);
    setReportOpen(true);
  }

  function handleReportClosed() {
    setReportOpen(false);
    menuButtonRef.current?.focus();
  }

  function handleDialogCancel() {
    restoreFocusRef.current = true;
    setDialogOpen(false);
  }

  function handleConfirm() {
    setDialogOpen(false);
    onDelete();
  }

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <span className={`${styles.avatar} ${styles.cardAvatar}`} aria-hidden="true">
          {avatarInitial(reply.author.displayName)}
        </span>
        <div className={styles.who}>
          <span className={styles.name}>{reply.author.displayName}</span>
          <span className={styles.meta}>
            @{reply.author.handle} · <time dateTime={reply.createdAt}>{formatPostDate(reply.createdAt)}</time>
          </span>
        </div>
        {isOwn || canReport ? (
          <div
            ref={menuWrapRef}
            style={{ position: 'relative', marginLeft: 'auto' }}
            onKeyDown={handleMenuKeyDown}
            onBlur={handleMenuBlur}
          >
            <button
              ref={menuButtonRef}
              type="button"
              className="y-iconbtn y-iconbtn-muted"
              aria-label="Options de cette réponse"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {menuOpen ? (
              <div id={menuId} role="menu" className="y-menu y-qpost-menu">
                {isOwn ? (
                  <button
                    ref={menuItemRef}
                    type="button"
                    role="menuitem"
                    className="y-menu-item is-danger"
                    onClick={handleDeleteChosen}
                  >
                    Supprimer ma réponse
                  </button>
                ) : (
                  <button
                    ref={menuItemRef}
                    type="button"
                    role="menuitem"
                    className="y-menu-item"
                    onClick={handleReportChosen}
                  >
                    Signaler
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>
      <p className={styles.body}>
        <MentionText text={reply.text} linkable={new Set(reply.mentionLinks)} />
      </p>
      <div className={styles.reactions} role="group" aria-label="Réactions à la réponse">
        {REACTIONS.map(({ kind, label, icon }) => (
          <button
            key={kind}
            type="button"
            className={styles.reaction}
            data-kind={kind}
            aria-pressed={reply.viewerReactions.includes(kind)}
            aria-disabled={reactionPending || undefined}
            onClick={() => {
              if (!reactionPending) {
                onReact(kind);
              }
            }}
          >
            <span className={styles.glyph} aria-hidden="true">
              <FeedIcon name={icon} size={15} />
            </span>
            <span>{reply.counters[kind]}</span> <span className="y-sr">{label}</span>
          </button>
        ))}
      </div>
      {reportNotice ? (
        <p role="status" className="y-dialog-text">
          {reportNotice}
        </p>
      ) : null}
      {isOwn ? (
        <DeleteReplyDialog open={dialogOpen} onConfirm={handleConfirm} onCancel={handleDialogCancel} />
      ) : null}
      {canReport && reportOpen ? (
        <ReportDialog
          open={reportOpen}
          kind="reply"
          target={{ replyId: reply.id }}
          onClose={handleReportClosed}
          onSent={() => {
            setReportOpen(false);
            setReportNotice(REPORT_SENT_MESSAGE);
            menuButtonRef.current?.focus();
          }}
        />
      ) : null}
    </article>
  );
}
