import { HomeFeed } from '@/components/feed/home-feed';
import { requireSession } from '../session-guard';
import styles from './home.module.css';

export default async function HomePage() {
  const user = await requireSession();

  return (
    <main className={styles.column}>
      <h1 className="y-sr">Accueil</h1>
      <div role="tablist" className={styles.tabs}>
        <button
          type="button"
          role="tab"
          id="tab-for-you"
          aria-selected="true"
          aria-controls="feed-panel"
          className={styles.tab}
        >
          Pour vous
        </button>
      </div>
      <div role="tabpanel" id="feed-panel" aria-labelledby="tab-for-you">
        <HomeFeed
          displayName={user.displayName}
          viewerHandle={user.handle}
          suspended={user.status === 'suspended'}
        />
      </div>
    </main>
  );
}
