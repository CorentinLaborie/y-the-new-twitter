import { ProfileScreen } from '@/components/profile/profile-screen';
import { requireSession } from '../../session-guard';

/** The profile of an account (L1): /u/[handle]. The handle is in the path; the page shows what the API allows. */
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const user = await requireSession();
  const { handle } = await params;

  return (
    <main>
      <ProfileScreen handle={handle} viewerHandle={user.handle} suspended={user.status === 'suspended'} />
    </main>
  );
}
