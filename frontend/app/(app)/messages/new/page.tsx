import { requireSession } from '../../session-guard';
import { NewMessageScreen } from '@/components/messages/new-message-screen';
import styles from '@/components/messages/messages.module.css';

/** A new private message: the recipient and the first text, as on the Messages-New boards (07 · Messages). */
export default async function NewMessagePage() {
  await requireSession();

  return (
    <main className={styles.newPage}>
      <NewMessageScreen />
    </main>
  );
}
