'use client';

import { useEffect, useState } from 'react';
import { useReloadOnBack } from '@/lib/use-reload-on-back';
import { FeedError, FeedLoading } from '@/components/feed/feed-states';
import { FeedIcon } from '@/components/feed/feed-icon';
import { EXPLORE_LOAD_FAILURE } from '@/lib/explore-rules';
import { fetchHashtagPage, type HashtagPage } from '@/lib/explore-api';
import { ExploreQuestionList } from './explore-question-list';
import styles from './explore.module.css';

type Phase = 'loading' | 'ready' | 'failed';

type State = { phase: Phase; page: HashtagPage | null; more: 'idle' | 'loading' | 'failed' };

const LOADING: State = { phase: 'loading', page: null, more: 'idle' };

/**
 * The newest visible questions of one hashtag (M4, section 3.2), with "Voir plus" pages. The questions are ordered by
 * date, most recent first (decision of 2026-10-27).
 */
export function HashtagScreen({
  tag,
  viewer,
}: {
  tag: string;
  viewer: { handle: string; suspended: boolean };
}) {
  const [attempt, setAttempt] = useState(0);
  useReloadOnBack(() => setAttempt((count) => count + 1));
  // The state of an earlier tag or attempt is never shown: each stored state carries the key it answers.
  const [stored, setStored] = useState<{ tag: string; attempt: number; state: State } | null>(null);
  const state: State =
    stored !== null && stored.tag === tag && stored.attempt === attempt ? stored.state : LOADING;

  useEffect(() => {
    let current = true;
    void fetchHashtagPage(tag).then((result) => {
      if (current) {
        const next: State = result.ok
          ? { phase: 'ready', page: result.body, more: 'idle' }
          : { phase: 'failed', page: null, more: 'idle' };
        setStored({ tag, attempt, state: next });
      }
    });

    return () => {
      current = false;
    };
  }, [tag, attempt]);

  async function loadMore() {
    const cursor = state.page?.nextCursor;
    if (!cursor || state.page === null || state.more === 'loading') {
      return;
    }
    const page = state.page;
    setStored({ tag, attempt, state: { ...state, more: 'loading' } });
    const result = await fetchHashtagPage(tag, cursor);
    setStored({
      tag,
      attempt,
      state: result.ok
        ? {
            phase: 'ready',
            page: {
              questions: [...page.questions, ...result.body.questions],
              nextCursor: result.body.nextCursor,
            },
            more: 'idle',
          }
        : { ...state, more: 'failed' },
    });
  }

  return (
    <section aria-label={`Questions avec #${tag}`} className={styles.screen}>
      {state.phase === 'loading' ? <FeedLoading /> : null}
      {state.phase === 'failed' ? (
        <FeedError message={EXPLORE_LOAD_FAILURE} onRetry={() => setAttempt((count) => count + 1)} />
      ) : null}
      {state.phase === 'ready' && state.page !== null ? (
        state.page.questions.length === 0 ? (
          <div className="y-empty">
            <span className="y-empty-icon">
              <FeedIcon name="message-circle" size={28} />
            </span>
            <h2>Aucune question avec #{tag}</h2>
            <p>Les questions avec ce hashtag apparaîtront ici.</p>
          </div>
        ) : (
          <>
            <ExploreQuestionList
              label={`Questions avec #${tag}`}
              questions={state.page.questions}
              viewer={viewer}
              separated
            />
            {state.page.nextCursor !== null ? (
              <div className={styles.more}>
                <button
                  type="button"
                  className="y-loadmore"
                  onClick={() => void loadMore()}
                  disabled={state.more === 'loading'}
                >
                  {state.more === 'loading' ? 'Chargement…' : 'Voir plus'}
                </button>
                {state.more === 'failed' ? (
                  <p role="alert" className="y-errorstate-message">
                    La page suivante n’a pas pu être chargée. Réessayez.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )
      ) : null}
    </section>
  );
}
