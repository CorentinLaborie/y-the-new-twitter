import Link from 'next/link';
import type { ApiProblem } from '@/lib/api-client';
import styles from './admin.module.css';

/** Status code the API answers when the back-office session has ended (no elevation, or expired). */
const SESSION_ENDED_STATUS = 401;

/**
 * Message of a failed call. A 401 means the back-office session has ended: the page then links to the login screen,
 * and the message says so without any detail from the API.
 */
export function AdminLoadError({ problem }: { problem: ApiProblem }) {
  if (problem.status === SESSION_ENDED_STATUS) {
    return (
      <p role="alert" className={styles.stateText}>
        Votre session d’administration a pris fin. <Link href="/admin/login">Se reconnecter</Link>
      </p>
    );
  }
  return (
    <p role="alert" className={styles.stateText}>
      {problem.detail}
    </p>
  );
}

export function AdminLoading() {
  return (
    <p role="status" className={styles.stateText}>
      Chargement…
    </p>
  );
}
