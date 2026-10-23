import type { FeedTabId } from '@/lib/feed-api';
import { requireSession } from '../session-guard';
import { HomeTabs } from './home-tabs';
import styles from './home.module.css';

/** The tab is in the URL: ?tab=following opens "Abonnements", anything else "Pour vous" (L3, section 7.1). */
function tabFrom(value: string | string[] | undefined): FeedTabId {
  return value === 'following' ? 'following' : 'for-you';
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const user = await requireSession();
  const { tab } = await searchParams;

  return (
    <main className={styles.column}>
      <h1 className="y-sr">Accueil</h1>
      <HomeTabs
        initialTab={tabFrom(tab)}
        displayName={user.displayName}
        viewerHandle={user.handle}
        suspended={user.status === 'suspended'}
      />
    </main>
  );
}
