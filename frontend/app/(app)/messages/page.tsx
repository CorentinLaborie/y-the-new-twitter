import Link from 'next/link';
import { requireSession } from '../session-guard';
import { MessagesScreen } from '@/components/messages/messages-screen';
import styles from '../home/home.module.css';
import messagesStyles from '@/components/messages/messages.module.css';

/** The private messages of the viewer (section 9): the conversations, the requests waiting for them, the archives. */
export default async function MessagesPage() {
  await requireSession();

  return (
    <main className={styles.column}>
      <div className={messagesStyles.pageHeader}>
        <h1>Messages</h1>
        <Link href="/messages/new" className={`${messagesStyles.button} ${messagesStyles.buttonOutline}`}>
          Nouveau message
        </Link>
      </div>
      <MessagesScreen />
    </main>
  );
}
