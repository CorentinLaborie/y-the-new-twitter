'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/avatar/user-avatar';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useReloadOnBack } from '@/lib/use-reload-on-back';
import { BlockDialog } from '@/components/block/block-dialog';
import { EditProfileDialog } from './edit-profile-dialog';
import { blockedMessage } from '@/components/block/block-rules';
import { FollowButton } from '@/components/follow/follow-button';
import { FeedError, FeedLoading, CONNECTION_FAILURE_MESSAGE } from '@/components/feed/feed-states';
import { QuestionCard } from '@/components/feed/question-card';
import type { FeedQuestion } from '@/lib/feed-api';
import { fetchProfile, fetchProfileQuestions, type OwnProfile, type ProfileView } from '@/lib/profile-api';
import { useProfileReactions } from './use-profile-reactions';
import styles from './profile.module.css';

type Phase = 'loading' | 'ready' | 'notFound' | 'failed';

/** The profile of an account (L1): name, handle, bio, date of joining, counts, follow state, and its questions. */
export function ProfileScreen({
  handle,
  viewerHandle,
  suspended,
}: {
  handle: string;
  viewerHandle: string | null;
  /** True for a suspended viewer: the follow control stays off. */
  suspended: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [questions, setQuestions] = useState<FeedQuestion[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreStatus, setMoreStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [loadError, setLoadError] = useState('');
  const { pendingIds, errors, react } = useProfileReactions(setQuestions);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockNotice, setBlockNotice] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();

  /** The page shows the saved fields at once. A new handle moves the page to its new address. */
  function profileSaved(saved: OwnProfile) {
    setEditOpen(false);
    setProfile((current) => (current === null ? current : { ...current, ...saved }));
    if (saved.handle !== handle) {
      router.replace(`/u/${saved.handle}`);
    }
  }

  const loadFirst = useCallback(() => {
    Promise.all([fetchProfile(handle), fetchProfileQuestions(handle)]).then(([account, page]) => {
      if (!account.ok) {
        setPhase(account.problem.status === 404 ? 'notFound' : 'failed');
        setLoadError(CONNECTION_FAILURE_MESSAGE);
        return;
      }
      if (!page.ok) {
        setPhase(page.problem.status === 404 ? 'notFound' : 'failed');
        setLoadError(CONNECTION_FAILURE_MESSAGE);
        return;
      }
      setProfile(account.body);
      setQuestions(page.body.questions);
      setNextCursor(page.body.nextCursor);
      setPhase('ready');
    });
  }, [handle]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  useReloadOnBack(loadFirst);

  function loadMore(cursor: string) {
    setMoreStatus('loading');
    fetchProfileQuestions(handle, cursor).then((result) => {
      if (!result.ok) {
        setMoreStatus('failed');
        return;
      }
      setQuestions((current) => [...current, ...result.body.questions]);
      setNextCursor(result.body.nextCursor);
      setMoreStatus('idle');
    });
  }

  if (phase === 'loading') {
    return <FeedLoading />;
  }
  if (phase === 'notFound') {
    return (
      <div className="y-empty">
        <h2>Cette page n’existe pas</h2>
        <p>Ce compte n’est pas disponible.</p>
      </div>
    );
  }
  if (phase === 'failed' || profile === null) {
    return (
      <FeedError
        message={loadError}
        onRetry={() => {
          setPhase('loading');
          loadFirst();
        }}
      />
    );
  }

  const joined = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(new Date(profile.joinedAt));

  return (
    <div className={styles.screen}>
      <section className={styles.head} aria-label={`Profil de ${profile.displayName}`}>
        <div className={styles.top}>
          <UserAvatar
            className={styles.avatar}
            displayName={profile.displayName}
            avatarUrl={profile.avatarUrl}
          />
          {profile.isOwnAccount && !suspended ? (
            <button
              type="button"
              className="y-btn y-btn-md y-btn-outline y-btn-pill"
              onClick={() => setEditOpen(true)}
            >
              Modifier le profil
            </button>
          ) : null}
          {profile.isOwnAccount || viewerHandle === null ? null : (
            <FollowButton
              handle={profile.handle}
              initialFollows={profile.viewerFollows}
              disabled={suspended}
            />
          )}
          {profile.isOwnAccount || viewerHandle === null || suspended ? null : (
            <button
              type="button"
              className="y-btn y-btn-md y-btn-outline y-btn-pill"
              onClick={() => setBlockOpen(true)}
            >
              Bloquer
            </button>
          )}
        </div>
        {blockNotice ? <p role="status">{blockNotice}</p> : null}
        {profile.isOwnAccount && !suspended ? (
          <EditProfileDialog
            open={editOpen}
            profile={profile}
            onClose={() => setEditOpen(false)}
            onSaved={profileSaved}
          />
        ) : null}
        {profile.isOwnAccount || viewerHandle === null || suspended || !blockOpen ? null : (
          <BlockDialog
            open={blockOpen}
            handle={profile.handle}
            onClose={() => setBlockOpen(false)}
            onBlocked={() => {
              setBlockOpen(false);
              setBlockNotice(blockedMessage(profile.handle));
            }}
          />
        )}
        <h1 className={styles.name}>{profile.displayName}</h1>
        <p className={styles.handle}>@{profile.handle}</p>
        {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
        <p className={styles.meta}>A rejoint Y en {joined}</p>
        <p className={styles.counts}>
          <Link href={`/u/${profile.handle}/following`}>
            <strong>{profile.followingCount.toLocaleString('fr-FR')}</strong> abonnements
          </Link>
          <Link href={`/u/${profile.handle}/followers`}>
            <strong>{profile.followerCount.toLocaleString('fr-FR')}</strong> abonnés
          </Link>
        </p>
      </section>

      {questions.length > 0 ? (
        <ul className={styles.list} aria-label="Questions de ce compte">
          {questions.map((question) => (
            <li key={question.id}>
              <QuestionCard
                question={question}
                reactionPending={pendingIds.includes(question.id)}
                reactionError={errors[question.id] ?? null}
                onReact={(kind) => react(question, kind)}
                replyCount={question.counters.reply}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="y-empty">
          <p>Aucune question publiée pour l’instant.</p>
        </div>
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
