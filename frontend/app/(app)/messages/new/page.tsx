import { requireSession } from '../../session-guard';
import { NewMessageScreen } from '@/components/messages/new-message-screen';
import styles from '../../home/home.module.css';

/** A new private message: the handle of the recipient and the first text. */
export default async function NewMessagePage() {
  await requireSession();

  return (
    <main className={styles.column}>
      <h1>Nouveau message</h1>
      <NewMessageScreen />
    </main>
  );
}
