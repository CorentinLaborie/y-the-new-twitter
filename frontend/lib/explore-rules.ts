/*
 * Rules of the Explore screens (M4), pure functions. The search text is trimmed and kept to 100 characters, the same
 * limit as the API (SearchQueryDto). The hashtag names are lowercase letters, digits and underscore.
 */

export const SEARCH_MAX_LENGTH = 100;

/** The placeholder of the search field (DEC-099, shortened on desktop by DEC-109). */
export const SEARCH_PLACEHOLDER = 'Question, compte ou #hashtag';

/** The label of the trend reactions (DEC-091). */
export const TRENDS_WINDOW_LABEL = 'sur 24 h';

/** The text sent to the search: trimmed, cut to the limit. An empty result means no search. */
export function normalizeSearch(value: string): string {
  return value.trim().slice(0, SEARCH_MAX_LENGTH);
}

/** The address of a hashtag page. */
export function hashtagHref(name: string): string {
  return `/hashtags/${encodeURIComponent(name)}`;
}

/** The address of a search, kept in the URL so that it can be shared. */
export function exploreSearchHref(text: string): string {
  return text === '' ? '/explore' : `/explore?q=${encodeURIComponent(text)}`;
}

/** The count of reactions as the trends show it, with the « sur 24 h » label. */
export function trendReactionsLabel(count: number): string {
  return count === 1 ? `1 réaction ${TRENDS_WINDOW_LABEL}` : `${count} réactions ${TRENDS_WINDOW_LABEL}`;
}

/** The French message of a failed load on the Explore screens. */
export const EXPLORE_LOAD_FAILURE = 'Les tendances ne peuvent pas être chargées pour l’instant. Réessayez.';
