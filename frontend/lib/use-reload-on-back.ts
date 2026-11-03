'use client';

import { useEffect, useRef } from 'react';

/**
 * Calls `reload` when the viewer goes back or forward in the history. Going back restores a screen without running its
 * loading effect, so a list would keep its old answer: this asks it again. The latest `reload` is always the one called.
 */
export function useReloadOnBack(reload: () => void): void {
  const latest = useRef(reload);

  useEffect(() => {
    latest.current = reload;
  });

  useEffect(() => {
    function onBack() {
      latest.current();
    }
    window.addEventListener('popstate', onBack);

    return () => {
      window.removeEventListener('popstate', onBack);
    };
  }, []);
}
