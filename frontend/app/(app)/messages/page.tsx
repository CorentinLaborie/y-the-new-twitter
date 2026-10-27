import Link from 'next/link';
import { requireSession } from '../session-guard';
import { MessagesScreen } from '@/components/messages/messages-screen';
import styles from '@/components/messages/messages.module.css';

/** The private messages of the viewer (section 9): the conversations, the requests waiting for them, the archives. */
export default async function MessagesPage() {
  await requireSession();

  return (
    <main className={styles.column}>
      <header className={styles.header}>
        <h1 className={styles.title}>Messages</h1>
        <Link href="/messages/new" className={`y-btn y-btn-outline y-btn-sm ${styles.newMessage}`}>
          Nouveau message
        </Link>
      </header>
      <MessagesScreen />
    </main>
  );
}
