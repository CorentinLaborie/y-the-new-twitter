'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/auth-api';
import { LEGAL_LINKS, SETTINGS_LINK } from './nav-items';
import styles from './navigation.module.css';

/**
 * The links of the "Plus" menu that are not destinations: settings, "Aide et à propos" (the legal pages, DEC-271) and
 * the sign-out. Used by the more menu (sheet, rail, sidebar) and by the full-screen mobile menu.
 */
export function SecondaryLinks({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();

  async function handleSignOut() {
    await logout();
    onNavigate?.();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className={styles.secondary}>
      {/* Planned route: /settings (lot L5). The screen is not built in L0. */}
      <Link href={SETTINGS_LINK.href} className={styles.secondaryLink} onClick={onNavigate}>
        {SETTINGS_LINK.label}
      </Link>
      <h3 className={styles.secondaryTitle}>Aide et à propos</h3>
      {LEGAL_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={styles.secondaryLink} onClick={onNavigate}>
          {link.label}
        </Link>
      ))}
      <button type="button" className={styles.secondaryLink} onClick={handleSignOut}>
        Déconnexion
      </button>
    </div>
  );
}
