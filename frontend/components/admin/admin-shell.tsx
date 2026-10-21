'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { YMark } from '@/components/brand/y-mark';
import type { AdminUser } from '@/lib/admin-api';
import { signOut } from '@/lib/admin-api';
import styles from './admin.module.css';

const ADMIN_NAV_ITEMS = [
  { href: '/admin', label: 'Tableau de bord' },
  { href: '/admin/users', label: 'Comptes' },
  { href: '/admin/audit', label: 'Journal d’audit' },
] as const;

/**
 * The current section of the menu. The dashboard is only current on its own path; the other sections are current on
 * their path and below it.
 */
export function isActiveNavItem(itemHref: string, pathname: string): boolean {
  if (itemHref === '/admin') {
    return pathname === '/admin';
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}

/** Side menu and frame of the back-office. Signing out ends the session on the server, then goes to the login screen. */
export function AdminShell({ user, children }: { user: AdminUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push('/admin/login');
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <div className={styles.brand}>
          <YMark size={40} />
          <strong>Administration</strong>
        </div>
        <nav className={styles.nav} aria-label="Sections d’administration">
          {ADMIN_NAV_ITEMS.map((item) => {
            const active = isActiveNavItem(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? styles.navItemActive : styles.navItem}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.sideFoot}>
          <strong>{user.displayName}</strong>
          <span>@{user.handle}</span>
          <button type="button" className={styles.signOut} onClick={handleSignOut}>
            Déconnexion
          </button>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
