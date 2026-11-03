'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/avatar/user-avatar';
import { useEffect, useState } from 'react';
import { useReloadOnBack } from '@/lib/use-reload-on-back';
import { CONNECTION_FAILURE_MESSAGE, FeedError, FeedLoading } from '@/components/feed/feed-states';
import { FollowButton } from '@/components/follow/follow-button';
import { fetchFollowList, type FollowAccount } from '@/lib/profile-api';
import styles from './profile.module.css';

type Phase = 'loading' | 'ready' | 'notFound' | 'failed';

const TITLES = { followers: 'Abonnés', following: 'Abonnements' } as const;
const EMPTY = {
  followers: 'Aucun abonné pour l’instant.',
  following: 'Aucun abonnement pour l’instant.',
} as const;

/**
 * The followers or following list of an account (L3, section 7.4): one row per account, with its follow pill. The
 * viewer's own row has no pill. Pages of 20, with "Voir plus".
 */
export function FollowListScreen({
  handle,
  list,
  viewerHandle,
  suspended,
}: {
  handle: string;
  list: 'followers' | 'following';
  viewerHandle: string | null;
  suspended: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [accounts, setAccounts] = useState<FollowAccount[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreStatus, setMoreStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [attempt, setAttempt] = useState(0);
  useReloadOnBack(() => setAttempt((count) => count + 1));

  useEffect(() => {
    let active = true;
    fetchFollowList(handle, list).then((result) => {
      if (!active) {
        return;
      }
      if (!result.ok) {
        setPhase(result.problem.status === 404 ? 'notFound' : 'failed');
        return;
      }
      setAccounts(result.body.items);
      setNextCursor(result.body.nextCursor);
      setPhase('ready');
    });
    return () => {
      active = false;
    };
  }, [handle, list, attempt]);

  function loadMore(cursor: string) {
    setMoreStatus('loading');
    fetchFollowList(handle, list, cursor).then((result) => {
      if (!result.ok) {
        setMoreStatus('failed');
        return;
      }
      setAccounts((current) => [...current, ...result.body.items]);
      setNextCursor(result.body.nextCursor);
      setMoreStatus('idle');
    });
  }

  const title = TITLES[list];
  const back = (
    <p className={styles.back}>
      <Link href={`/u/${handle}`}>Retour au profil de @{handle}</Link>
    </p>
  );

  if (phase === 'loading') {
    return (
      <div className={styles.screen}>
        <h1 className={styles.listTitle}>{title}</h1>
        {back}
        <FeedLoading />
      </div>
    );
  }
  if (phase === 'notFound') {
    return (
      <div className="y-empty">
        <h2>Cette page n’existe pas</h2>
        <p>Ce compte n’est pas disponible.</p>
      </div>
    );
  }
  if (phase === 'failed') {
    return (
      <div className={styles.screen}>
        <h1 className={styles.listTitle}>{title}</h1>
        {back}
        <FeedError
          message={CONNECTION_FAILURE_MESSAGE}
          onRetry={() => {
            setPhase('loading');
            setAttempt((count) => count + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.listTitle}>{title}</h1>
      {back}
      {accounts.length === 0 ? (
        <div className="y-empty">
          <p>{EMPTY[list]}</p>
        </div>
      ) : (
        <ul className={styles.accounts} aria-label={title}>
          {accounts.map((account) => (
            <li key={account.handle} className={styles.account}>
              <UserAvatar
                className={styles.avatarSmall}
                displayName={account.displayName}
                avatarUrl={account.avatarUrl}
              />
              <span className={styles.accountText}>
                <Link href={`/u/${account.handle}`} className={styles.accountName}>
                  {account.displayName}
                </Link>
                <span className={styles.accountHandle}>@{account.handle}</span>
              </span>
              {account.handle === viewerHandle ? null : (
                <FollowButton
                  handle={account.handle}
                  initialFollows={account.viewerFollows}
                  disabled={suspended}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {nextCursor && moreStatus !== 'failed' ? (
        <button
          type="button"
          className={styles.more}
          disabled={moreStatus === 'loading'}
          onClick={() => loadMore(nextCursor)}
        >
          {moreStatus === 'loading' ? 'Chargement…' : 'Voir plus'}
        </button>
      ) : null}
      {moreStatus === 'failed' ? (
        <FeedError message={CONNECTION_FAILURE_MESSAGE} onRetry={() => nextCursor && loadMore(nextCursor)} />
      ) : null}
    </div>
  );
}
