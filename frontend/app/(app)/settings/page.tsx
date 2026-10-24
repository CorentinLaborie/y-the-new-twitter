import type { Metadata } from 'next';
import { SettingsHub } from '@/components/settings/settings-hub';

export const metadata: Metadata = { title: 'Paramètres — Y' };

/** The settings hub (plan L5, step 4). The sections are built one by one in the following steps. */
export default function SettingsPage() {
  return <SettingsHub />;
}
