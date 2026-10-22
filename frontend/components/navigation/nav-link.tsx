import Link from 'next/link';
import { YIcon } from '@/components/brand/y-icon';
import { isEntryCurrent, type NavEntry, type NavViewer } from './nav-items';
import styles from './navigation.module.css';
import { entryAccessibleName, unreadBadgeText } from './unread-label';

/** Where the link sits: the sidebar (icon and label), the rail (icon), the bottom bar (icon, label below), the sheet. */
export type NavLinkVariant = 'sidebar' | 'rail' | 'bar' | 'sheet';

type NavLinkProps = {
  entry: NavEntry;
  viewer: NavViewer;
  pathname: string;
  unread: number;
  variant: NavLinkVariant;
  onNavigate?: () => void;
};

/** Joins CSS module class names, leaving out the empty ones. */
export function classNames(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/**
 * One destination of the navigation. The current page gets aria-current="page" and the filled or heavier icon. The
 * accessible name is the label with the unread count, so the icon-only variants keep the whole name (decision 12).
 */
export function NavLink({ entry, viewer, pathname, unread, variant, onNavigate }: NavLinkProps) {
  const current = isEntryCurrent(entry, pathname, viewer.handle);
  const iconName = current && entry.activeIcon ? entry.activeIcon : entry.icon;
  const badge = entry.countsUnread ? unreadBadgeText(unread) : null;

  return (
    <Link
      href={entry.href(viewer.handle)}
      className={classNames(styles.link, styles[variant], current && styles.current)}
      aria-current={current ? 'page' : undefined}
      aria-label={entryAccessibleName(entry, unread)}
      onClick={onNavigate}
    >
      <span className={styles.iconBox}>
        <YIcon name={iconName} size={26} strokeWidth={current ? 2.5 : 2} />
        {badge === null ? null : <NavBadge text={badge} />}
      </span>
      {variant === 'rail' ? null : <span className={styles.label}>{entry.label}</span>}
    </Link>
  );
}

/** The unread count on an icon. Hidden from the accessible tree: the link name carries the count. */
export function NavBadge({ text }: { text: string }) {
  return (
    <span className={styles.badge} aria-hidden="true">
      {text}
    </span>
  );
}
