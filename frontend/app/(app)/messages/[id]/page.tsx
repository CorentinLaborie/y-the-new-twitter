import { notFound } from 'next/navigation';
import { requireSession } from '../../session-guard';
import { ConversationScreen } from '@/components/messages/conversation-screen';
import styles from '../../home/home.module.css';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One private conversation of the viewer. The session is checked on the server before the thread loads. */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }
  await requireSession();

  return (
    <main className={styles.column}>
      <ConversationScreen conversationId={id} />
    </main>
  );
}
