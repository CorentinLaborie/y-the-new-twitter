import { requireSession } from '../../session-guard';
import { NewMessageScreen } from '@/components/messages/new-message-screen';
import styles from '@/components/messages/messages.module.css';

/** A new private message: the handle of the recipient and the first text. Same header as the Messages list. */
export default async function NewMessagePage() {
  await requireSession();

  return (
    <main className={styles.column}>
      <header className={styles.header}>
        <h1 className={styles.title}>Nouveau message</h1>
      </header>
      <NewMessageScreen />
    </main>
  );
}
