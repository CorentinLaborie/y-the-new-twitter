'use client';

// Replaces the root layout when it fails, so it defines its own <html> and <body>.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="fr">
      <body>
        <main style={{ padding: '32px', fontFamily: 'system-ui, sans-serif' }}>
          <h1>Une erreur est survenue</h1>
          <p>Le site n’a pas pu s’afficher. Vous pouvez réessayer.</p>
          <button type="button" onClick={reset}>
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
