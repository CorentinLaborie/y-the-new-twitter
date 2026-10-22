import type { Metadata } from 'next';
import { NotificationsScreen } from '@/components/notifications/notifications-screen';
import type { NotificationTab } from '@/lib/notifications-api';
import { requireSession } from '../session-guard';

export const metadata: Metadata = { title: 'Notifications — Y' };

/** The tab is in the URL: ?tab=mention opens the Mentions tab, anything else the "Toutes" tab. */
function tabFrom(value: string | string[] | undefined): NotificationTab {
  return value === 'mention' ? 'mention' : 'all';
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const user = await requireSession();
  const { tab } = await searchParams;

  return <NotificationsScreen initialTab={tabFrom(tab)} suspended={user.status === 'suspended'} />;
}
