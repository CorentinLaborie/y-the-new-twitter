import { requireSession } from '../session-guard';
import { MessagesScreen } from '@/components/messages/messages-screen';
import styles from '../home/home.module.css';

/** The private messages of the viewer (section 9): the conversations, the requests waiting for them, the archives. */
export default async function MessagesPage() {
  await requireSession();

  return (
    <main className={styles.column}>
      <h1>Messages</h1>
      <MessagesScreen />
    </main>
  );
}
