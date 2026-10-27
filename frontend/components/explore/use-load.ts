'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResult } from '@/lib/api-client';

export type LoadState<T> = { phase: 'loading' } | { phase: 'ready'; data: T } | { phase: 'failed' };

type Stored<T> = { key: string; attempt: number; state: LoadState<T> };

/**
 * Loads one section of an Explore screen. The load runs again when `key` changes or when `reload` is called. The state
 * of an old key is never shown: while a new key loads, the answer is `loading`. A late answer for an old key is ignored.
 */
export function useLoad<T>(key: string, load: () => Promise<ApiResult<T>>): [LoadState<T>, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [stored, setStored] = useState<Stored<T> | null>(null);

  useEffect(() => {
    let current = true;
    void load().then((result) => {
      if (current) {
        const state: LoadState<T> = result.ok ? { phase: 'ready', data: result.body } : { phase: 'failed' };
        setStored({ key, attempt, state });
      }
    });

    return () => {
      current = false;
    };
    // The loader is a new function on each render: the key and the attempt are what starts a new load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  const current = stored !== null && stored.key === key && stored.attempt === attempt ? stored.state : null;

  return [current ?? { phase: 'loading' }, reload];
}
