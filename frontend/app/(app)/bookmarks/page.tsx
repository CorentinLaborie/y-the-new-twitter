import { requireSession } from '../session-guard';
import { BookmarksScreen } from '@/components/bookmarks/bookmarks-screen';
import styles from '@/components/bookmarks/bookmarks.module.css';

/** The saved questions of the viewer (L4, section 7.1). The session is checked on the server before the list loads. */
export default async function BookmarksPage() {
  const user = await requireSession();

  return (
    <main className={styles.column}>
      <header className={styles.header}>
        <h1 className={styles.title}>Signets</h1>
      </header>
      <BookmarksScreen viewerHandle={user.handle} viewerSuspended={user.status === 'suspended'} />
    </main>
  );
}
