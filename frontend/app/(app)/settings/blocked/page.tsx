import type { Metadata } from 'next';
import { BlockedAccountsScreen } from '@/components/settings/blocked-accounts-screen';

export const metadata: Metadata = { title: 'Comptes bloqués — Y' };

/** The list of the accounts the viewer blocks (plan L6, S6). The /settings frame comes with L5. */
export default function BlockedAccountsPage() {
  return <BlockedAccountsScreen />;
}
