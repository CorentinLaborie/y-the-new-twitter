import { notFound } from 'next/navigation';
import { requireSession } from '../../session-guard';
import { HashtagScreen } from '@/components/explore/hashtag-screen';
import styles from '@/components/explore/explore.module.css';

/** A hashtag: letters, digits and underscore, 1 to 50 characters (the same rule as the API). */
const HASHTAG_PATTERN = /^[\p{L}\p{N}_]{1,50}$/u;

/** The questions of one hashtag (M4, section 3.2). An unknown hashtag shape is a missing page. */
export default async function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const user = await requireSession();
  const { tag } = await params;
  if (!HASHTAG_PATTERN.test(tag)) {
    notFound();
  }

  return (
    <main>
      <header>
        <h1 className={styles.hashtagTitle}>#{tag}</h1>
      </header>
      <HashtagScreen tag={tag} viewer={{ handle: user.handle, suspended: user.status === 'suspended' }} />
    </main>
  );
}
