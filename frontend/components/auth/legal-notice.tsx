import Link from 'next/link';

/** The legal line under the buttons, with links to the three legal pages (their text is still a placeholder). */
export function LegalNotice({ action }: { action: 'connectant' | 'inscrivant' }) {
  return (
    <>
      En vous {action}, vous acceptez nos <Link href="/terms">Conditions d’utilisation</Link>, notre{' '}
      <Link href="/privacy">Politique de confidentialité</Link> et notre{' '}
      <Link href="/cookies">Utilisation des cookies</Link>.
    </>
  );
}
