import type { Metadata } from 'next';
import { NotificationSettings } from '@/components/settings/notification-settings';

export const metadata: Metadata = { title: 'Notifications — Paramètres — Y' };

/** The notification preferences of the signed-in account (plan L5, step 8). */
export default function NotificationSettingsPage() {
  return <NotificationSettings />;
}
