import { requireSession } from '../session-guard';
import { ExploreScreen } from '@/components/explore/explore-screen';

/** The Explore screen (M4, section 3.2). The search text comes from the address (?q=), so a search can be shared. */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireSession();
  const { q } = await searchParams;
  const initialQuery = typeof q === 'string' ? q : '';

  return (
    <main>
      <ExploreScreen
        initialQuery={initialQuery}
        viewer={{ handle: user.handle, suspended: user.status === 'suspended' }}
      />
    </main>
  );
}
