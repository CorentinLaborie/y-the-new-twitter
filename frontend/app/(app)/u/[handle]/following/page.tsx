import { FollowListScreen } from '@/components/profile/follow-list-screen';
import { requireSession } from '../../../session-guard';

/** The following list of an account (L3, section 7.4): /u/[handle]/following. */
export default async function FollowingPage({ params }: { params: Promise<{ handle: string }> }) {
  const user = await requireSession();
  const { handle } = await params;

  return (
    <main>
      <FollowListScreen
        handle={handle}
        list="following"
        viewerHandle={user.handle}
        suspended={user.status === 'suspended'}
      />
    </main>
  );
}
