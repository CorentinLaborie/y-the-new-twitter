import { requireSession } from '../session-guard';
import { BookmarksScreen } from '@/components/bookmarks/bookmarks-screen';
import styles from '../home/home.module.css';

/** The saved questions of the viewer (L4, section 7.1). The session is checked on the server before the list loads. */
export default async function BookmarksPage() {
  const user = await requireSession();

  return (
    <main className={styles.column}>
      <h1>Signets</h1>
      <BookmarksScreen viewerHandle={user.handle} viewerSuspended={user.status === 'suspended'} />
    </main>
  );
}
