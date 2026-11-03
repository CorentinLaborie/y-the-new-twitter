import { avatarInitial } from '@/components/feed/avatar-initial';
import { apiBaseUrl } from '@/lib/api-client';
import styles from './user-avatar.module.css';

type UserAvatarProps = {
  displayName: string;
  /** The address of the profile photo, or null when the account has none (DEC-351). */
  avatarUrl: string | null;
  /** The size and the shape of the surface that shows the avatar. */
  className: string;
};

/*
 * The avatar of an account, on every surface (DEC-351): its profile photo when it has one, otherwise the initial of its
 * display name in the same circle. The name is written next to the avatar on every surface, so the photo has no text
 * alternative: it is decorative.
 */
export function UserAvatar({ displayName, avatarUrl, className }: UserAvatarProps) {
  if (avatarUrl === null) {
    return (
      <span className={className} aria-hidden="true">
        {avatarInitial(displayName)}
      </span>
    );
  }
  return <img className={`${className} ${styles.photo}`} src={`${apiBaseUrl()}${avatarUrl}`} alt="" />;
}
