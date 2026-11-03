'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/avatar/user-avatar';
import avatarStyles from './admin-avatar.module.css';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminPage } from '@/components/admin/admin-page';
import { AdminLoadError, AdminLoading } from '@/components/admin/admin-states';
import { CloseThreadDialog } from '@/components/admin/close-thread-dialog';
import { StatusLabel } from '@/components/admin/status-label';
import styles from '@/components/admin/admin.module.css';
import { getSupportThread, replySupportThread, type SupportThreadDetail } from '@/lib/admin-api';
import {
  ACCOUNT_STATUS_LABELS,
  accountStatusTone,
  SUPPORT_STATUS_LABELS,
  supportStatusTone,
} from '@/lib/admin-labels';
import { formatAdminDate, formatAdminDateTime } from '@/lib/admin-format';
import { supportReplyError } from '@/lib/admin-reports';
import type { ApiProblem } from '@/lib/api-client';

type ThreadState =
  | { status: 'loading' }
  | { status: 'error'; problem: ApiProblem }
  | { status: 'ready'; thread: SupportThreadDetail };

/**
 * One contact thread: its messages, the answer of an administrator (sent by e-mail to the account), and the closing. A
 * closed thread is read only. The account is shown with its masked e-mail address (DEC-035).
 */
export function SupportThreadScreen({ id }: { id: string }) {
  const [state, setState] = useState<ThreadState>({ status: 'loading' });
  const [reply, setReply] = useState('');
  const [replyMessage, setReplyMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let current = true;
    getSupportThread(id).then((result) => {
      if (!current) {
        return;
      }
      setState(
        result.ok ? { status: 'ready', thread: result.body } : { status: 'error', problem: result.problem },
      );
    });
    return () => {
      current = false;
    };
  }, [id]);

  /** Replaces the thread on screen by the one the API returned after an answer or a closing. */
  const showThread = useCallback((thread: SupportThreadDetail) => {
    setState({ status: 'ready', thread });
  }, []);

  if (state.status === 'loading') {
    return (
      <AdminPage title="Tribunal des bannis">
        <AdminLoading />
      </AdminPage>
    );
  }
  if (state.status === 'error') {
    return (
      <AdminPage title="Tribunal des bannis">
        <AdminLoadError problem={state.problem} />
      </AdminPage>
    );
  }

  const { thread } = state;
  const closed = thread.status === 'closed';
  const replyError = reply.trim() === '' ? null : supportReplyError(reply);

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (supportReplyError(reply) !== null || sending) {
      return;
    }
    setReplyMessage(null);
    setSending(true);
    const result = await replySupportThread(thread.id, reply.trim());
    setSending(false);

    if (result.ok) {
      setReply('');
      showThread(result.body);
      return;
    }
    setReplyMessage(result.problem.detail);
  }

  return (
    <AdminPage title="Tribunal des bannis">
      <div className={styles.toolbar}>
        <Link className={styles.back} href="/admin/support">
          Retour aux messages
        </Link>
        <span className={styles.muted}>Référence {thread.reference}</span>
      </div>
      <div className={styles.split}>
        <div className={styles.splitMain}>
          <section className={styles.panel} aria-labelledby="messages-title">
            <div className={styles.panelBody}>
              <h2 className={styles.panelTitle} id="messages-title">
                Messages
              </h2>
              <ol className={styles.messageList}>
                {thread.messages.map((message) => (
                  <li
                    key={message.id}
                    className={`${styles.message} ${message.authorType === 'admin' ? styles.messageAdmin : ''}`}
                  >
                    <span className={styles.messageMeta}>
                      <time dateTime={message.sentAt}>{formatAdminDateTime(message.sentAt)}</time>
                      {' · '}
                      {message.authorType === 'admin'
                        ? 'Réponse de l’administrateur, envoyée par e-mail'
                        : `Message de @${thread.account.handle}`}
                    </span>
                    <p className={styles.messageBody}>{message.body}</p>
                  </li>
                ))}
              </ol>
              {closed ? (
                <p className={styles.muted}>
                  Fil fermé{thread.closedAt ? ` le ${formatAdminDateTime(thread.closedAt)}` : ''} : aucune
                  réponse n’est possible.
                </p>
              ) : (
                <form className={styles.dialogForm} noValidate onSubmit={sendReply}>
                  <label className={styles.fieldLabel} htmlFor="support-reply">
                    Votre réponse
                  </label>
                  <textarea
                    id="support-reply"
                    name="reply"
                    rows={3}
                    className={styles.textarea}
                    placeholder="Rédigez votre réponse"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    aria-invalid={replyError ? true : undefined}
                    aria-describedby={
                      replyError ? 'support-reply-hint support-reply-error' : 'support-reply-hint'
                    }
                  />
                  <span id="support-reply-hint" className={styles.fieldHint}>
                    Envoyée par e-mail à l’adresse du compte. Enregistrée dans le journal d’audit.
                  </span>
                  {replyError ? (
                    <span id="support-reply-error" className={styles.fieldError}>
                      {replyError}
                    </span>
                  ) : null}
                  {replyMessage ? (
                    <p role="alert" className={styles.alert}>
                      {replyMessage}
                    </p>
                  ) : null}
                  <div className={styles.actions}>
                    <button
                      type="submit"
                      className={styles.primaryButton}
                      disabled={replyError !== null || reply.trim() === '' || sending}
                    >
                      {sending ? 'Envoi…' : 'Envoyer la réponse'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>

        <div className={styles.splitSide}>
          <section className={styles.panel} aria-labelledby="account-title">
            <div className={styles.panelBody}>
              <h2 className={styles.panelTitle} id="account-title">
                Compte
              </h2>
              <p>
                <UserAvatar
                  className={avatarStyles.avatar}
                  displayName={thread.account.displayName}
                  avatarUrl={thread.account.avatarUrl}
                />
                <strong>{thread.account.displayName}</strong>
                <br />
                <span className={styles.muted}>@{thread.account.handle}</span>
              </p>
              <dl className={styles.definitions}>
                <dt>Statut</dt>
                <dd>
                  <StatusLabel tone={accountStatusTone(thread.account.status)}>
                    {ACCOUNT_STATUS_LABELS[thread.account.status]}
                  </StatusLabel>
                </dd>
                <dt>Suspendu le</dt>
                <dd>
                  {thread.account.status === 'suspended' && thread.account.statusChangedAt
                    ? formatAdminDateTime(thread.account.statusChangedAt)
                    : '—'}
                </dd>
                <dt>Motif affiché</dt>
                <dd>{thread.account.suspensionReason ?? '—'}</dd>
                <dt>Inscription</dt>
                <dd>{formatAdminDate(thread.account.createdAt)}</dd>
                <dt>E-mail</dt>
                <dd className={styles.mono}>{thread.account.maskedEmail}</dd>
              </dl>
              <Link href={`/admin/users/${thread.account.id}`}>Ouvrir la fiche du compte</Link>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="actions-title">
            <div className={styles.panelBody}>
              <h2 className={styles.panelTitle} id="actions-title">
                Actions
              </h2>
              <p className={styles.muted}>
                Statut du fil :{' '}
                <StatusLabel tone={supportStatusTone(thread.status)}>
                  {SUPPORT_STATUS_LABELS[thread.status]}
                </StatusLabel>
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={closed}
                  onClick={() => setClosing(true)}
                >
                  Marquer comme traité
                </button>
              </div>
              <p className={styles.muted}>Ferme la demande. Aucun e-mail n’est envoyé.</p>
            </div>
          </section>
        </div>
      </div>

      {closing ? (
        <CloseThreadDialog
          threadId={thread.id}
          onCancel={() => setClosing(false)}
          onClosed={(closedThread) => {
            setClosing(false);
            showThread(closedThread);
          }}
        />
      ) : null}
    </AdminPage>
  );
}
