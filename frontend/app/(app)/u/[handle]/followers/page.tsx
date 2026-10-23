import { FollowListScreen } from '@/components/profile/follow-list-screen';
import { requireSession } from '../../../session-guard';

/** The followers list of an account (L3, section 7.4): /u/[handle]/followers. */
export default async function FollowersPage({ params }: { params: Promise<{ handle: string }> }) {
  const user = await requireSession();
  const { handle } = await params;

  return (
    <main>
      <FollowListScreen
        handle={handle}
        list="followers"
        viewerHandle={user.handle}
        suspended={user.status === 'suspended'}
      />
    </main>
  );
}
