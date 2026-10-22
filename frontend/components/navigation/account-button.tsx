import { avatarInitial } from '@/components/feed/avatar-initial';
import type { NavViewer } from './nav-items';
import { classNames } from './nav-link';
import styles from './navigation.module.css';

/**
 * The account block at the foot of the sidebar and of the rail: avatar and name. It opens the "Options du compte",
 * which is the more menu (settings, help, sign-out). Decision 6 of the L0 plan: the sign-out is in "Plus" only.
 * The sidebar has the name and handle as text, so its accessible name is that text (WCAG 2.5.3). Only the rail,
 * which shows the avatar alone, gets the "Options du compte" label.
 */
export function AccountButton({
  viewer,
  variant,
  expanded,
  onClick,
}: {
  viewer: NavViewer;
  variant: 'sidebar' | 'rail';
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={classNames(styles.account, styles[`account-${variant}`])}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={variant === 'rail' ? `Options du compte de ${viewer.displayName}` : undefined}
      onClick={onClick}
    >
      <span className={styles.avatar} aria-hidden="true">
        {avatarInitial(viewer.displayName)}
      </span>
      {variant === 'rail' ? null : (
        <span className={styles.accountText}>
          <span className={styles.accountName}>{viewer.displayName}</span>
          <span className={styles.accountHandle}>@{viewer.handle}</span>
        </span>
      )}
    </button>
  );
}
