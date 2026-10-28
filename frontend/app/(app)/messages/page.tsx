import Link from 'next/link';
import { requireSession } from '../session-guard';
import styles from '@/components/messages/messages.module.css';

/** The Messages pane when no conversation is open (Messages-Empty boards). The list is in the shell. */
export default async function MessagesPage() {
  await requireSession();

  return (
    <div className={styles.emptyPane}>
      <div className="y-empty">
        <h2>Aucune conversation ouverte</h2>
        <p>Choisissez une conversation dans la liste, ou commencez-en une.</p>
        <Link href="/messages/new" className="y-btn y-btn-outline y-btn-md y-btn-pill">
          Nouveau message
        </Link>
      </div>
    </div>
  );
}
