'use client';

import styles from '@/components/feedback.module.css';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className={styles.main} role="alert">
      <h1 className={styles.title}>Une erreur est survenue</h1>
      <p className={styles.text}>La page n’a pas pu s’afficher. Vous pouvez réessayer.</p>
      <button type="button" className={styles.button} onClick={reset}>
        Réessayer
      </button>
    </main>
  );
}
