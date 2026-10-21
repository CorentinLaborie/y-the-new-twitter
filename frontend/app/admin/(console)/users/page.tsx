import type { Metadata } from 'next';
import { AccountsScreen } from '@/components/admin/accounts-screen';

export const metadata: Metadata = {
  title: 'Administration — Comptes',
};

export default function AdminAccountsPage() {
  return <AccountsScreen />;
}
