'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { FeedError, FeedLoading } from '@/components/feed/feed-states';
import { FeedIcon } from '@/components/feed/feed-icon';
import {
  EXPLORE_LOAD_FAILURE,
  SEARCH_PLACEHOLDER,
  exploreSearchHref,
  hashtagHref,
  normalizeSearch,
  trendReactionsLabel,
} from '@/lib/explore-rules';
import { fetchPopular, fetchSuggestions, fetchTrends, search, type SearchResult } from '@/lib/explore-api';
import { ExploreQuestionList } from './explore-question-list';
import { useLoad, type LoadState } from './use-load';
import styles from './explore.module.css';

const TYPEAHEAD_DELAY_MS = 250;

const EMPTY_RESULT: SearchResult = { questions: [], hashtags: [], accounts: [] };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

/** One section: its skeleton while it loads, its retry button when it fails, or its content. */
function Ready<T>({
  state,
  onRetry,
  render,
}: {
  state: LoadState<T>;
  onRetry: () => void;
  render: (data: T) => ReactNode;
}) {
  if (state.phase === 'loading') {
    return <FeedLoading />;
  }
  if (state.phase === 'failed') {
    return <FeedError message={EXPLORE_LOAD_FAILURE} onRetry={onRetry} />;
  }
  return <>{render(state.data)}</>;
}

function Nothing({ text }: { text: string }) {
  return <p className={styles.nothing}>{text}</p>;
}

/**
 * The Explore screen (M4, section 3.2): search, trends, popular questions and suggested accounts. On desktop the trends
 * and the suggestions sit in a side column; under 1024 px they follow the main column, so nothing is lost (rule R5).
 * The search is kept in the address (`?q=`), so a search can be shared.
 */
export function ExploreScreen({
  initialQuery,
  viewer,
}: {
  initialQuery: string;
  viewer: { handle: string; suspended: boolean };
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(normalizeSearch(initialQuery));
  // The suggestions keep the text they answer: they are shown only while the field still holds that text.
  const [typeahead, setTypeahead] = useState<{ text: string; result: SearchResult } | null>(null);
  const typeaheadText = normalizeSearch(draft);
  const shownTypeahead =
    typeahead !== null && typeahead.text === typeaheadText && typeaheadText !== query
      ? typeahead.result
      : null;

  const [trends, reloadTrends] = useLoad('trends', fetchTrends);
  const [popular, reloadPopular] = useLoad('popular', fetchPopular);
  const [suggestions, reloadSuggestions] = useLoad('suggestions', fetchSuggestions);
  const [results, reloadResults] = useLoad(`search:${query}`, () =>
    query === '' ? Promise.resolve({ ok: true as const, status: 200, body: EMPTY_RESULT }) : search(query),
  );

  // Suggestions while typing: the same search, after a short pause, while the field differs from the query.
  useEffect(() => {
    const text = normalizeSearch(draft);
    if (text === '' || text === query) {
      return;
    }
    const timer = window.setTimeout(() => {
      void search(text).then((result) => {
        if (result.ok) {
          setTypeahead({ text, result: result.body });
        }
      });
    }, TYPEAHEAD_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [draft, query]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = normalizeSearch(draft);
    setQuery(text);
    router.replace(exploreSearchHref(text), { scroll: false });
  }

  function clear() {
    setDraft('');
    setQuery('');
    router.replace('/explore', { scroll: false });
  }

  return (
    <section aria-label="Explorer" className={styles.screen}>
      <form role="search" className={styles.search} onSubmit={submit}>
        <label htmlFor="explore-search" className={styles.visuallyHidden}>
          Rechercher
        </label>
        <input
          id="explore-search"
          type="search"
          name="q"
          className={styles.field}
          value={draft}
          maxLength={100}
          placeholder={SEARCH_PLACEHOLDER}
          onChange={(event) => setDraft(event.target.value)}
        />
        {draft !== '' ? (
          <button type="button" className={styles.clear} onClick={clear}>
            Effacer
          </button>
        ) : null}
        <button type="submit" className="y-btn y-btn-outline y-btn-md y-btn-pill">
          Rechercher
        </button>
      </form>

      {shownTypeahead !== null &&
      (shownTypeahead.hashtags.length > 0 || shownTypeahead.accounts.length > 0) ? (
        <ul className={styles.typeahead} aria-label="Suggestions de recherche">
          {shownTypeahead.hashtags.map((tag) => (
            <li key={`tag-${tag.name}`}>
              <Link href={hashtagHref(tag.name)} className={styles.typeaheadItem}>
                #{tag.name}
              </Link>
            </li>
          ))}
          {shownTypeahead.accounts.map((account) => (
            <li key={`account-${account.handle}`}>
              <Link href={`/u/${account.handle}`} className={styles.typeaheadItem}>
                {account.displayName} <span className={styles.muted}>@{account.handle}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.main}>
          {query !== '' ? (
            <Section title={`Résultats pour « ${query} »`}>
              <Ready
                state={results}
                onRetry={reloadResults}
                render={(data) => <SearchResults result={data} viewer={viewer} />}
              />
            </Section>
          ) : (
            <Section title="Questions populaires">
              <Ready
                state={popular}
                onRetry={reloadPopular}
                render={(data) =>
                  data.questions.length === 0 ? (
                    <Nothing text="Aucune question populaire pour l’instant." />
                  ) : (
                    <ExploreQuestionList
                      label="Questions populaires"
                      questions={data.questions}
                      viewer={viewer}
                    />
                  )
                }
              />
            </Section>
          )}
        </div>

        <aside className={styles.side}>
          <Section title="Tendances">
            <Ready
              state={trends}
              onRetry={reloadTrends}
              render={(data) =>
                data.hashtags.length === 0 ? (
                  <Nothing text="Aucune tendance pour l’instant." />
                ) : (
                  <ol className={styles.list}>
                    {data.hashtags.map((tag) => (
                      <li key={tag.name}>
                        <Link href={hashtagHref(tag.name)} className={styles.trend}>
                          <span className={styles.trendName}>#{tag.name}</span>
                          <span className={styles.muted}>{trendReactionsLabel(tag.reactions)}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )
              }
            />
          </Section>

          <Section title="Comptes à suivre">
            <Ready
              state={suggestions}
              onRetry={reloadSuggestions}
              render={(data) =>
                data.accounts.length === 0 ? (
                  <Nothing text="Aucun compte à suivre pour l’instant." />
                ) : (
                  <ul className={styles.list}>
                    {data.accounts.map((account) => (
                      <li key={account.id}>
                        <Link href={`/u/${account.handle}`} className={styles.account}>
                          <span className={styles.trendName}>{account.displayName}</span>
                          <span className={styles.muted}>@{account.handle}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )
              }
            />
          </Section>
        </aside>
      </div>
    </section>
  );
}

/** The results of a search: matching hashtags and accounts, then the questions. */
function SearchResults({
  result,
  viewer,
}: {
  result: SearchResult;
  viewer: { handle: string; suspended: boolean };
}) {
  if (result.questions.length === 0 && result.hashtags.length === 0 && result.accounts.length === 0) {
    return (
      <div className="y-empty">
        <span className="y-empty-icon">
          <FeedIcon name="message-circle" size={28} />
        </span>
        <h3>Aucun résultat</h3>
        <p>Essayez un autre texte, un autre #hashtag ou un autre compte.</p>
      </div>
    );
  }

  return (
    <>
      {result.hashtags.length > 0 ? (
        <ul className={styles.chips} aria-label="Hashtags trouvés">
          {result.hashtags.map((tag) => (
            <li key={tag.name}>
              <Link href={hashtagHref(tag.name)} className={styles.chip}>
                #{tag.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {result.accounts.length > 0 ? (
        <ul className={styles.list} aria-label="Comptes trouvés">
          {result.accounts.map((account) => (
            <li key={account.handle}>
              <Link href={`/u/${account.handle}`} className={styles.account}>
                <span className={styles.trendName}>{account.displayName}</span>
                <span className={styles.muted}>@{account.handle}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {result.questions.length > 0 ? (
        <ExploreQuestionList label="Questions trouvées" questions={result.questions} viewer={viewer} />
      ) : null}
    </>
  );
}
