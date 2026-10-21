import type { Metadata } from 'next';
import { AccountScreen } from '@/components/admin/account-screen';

export const metadata: Metadata = {
  title: 'Administration — Fiche du compte',
};

export default async function AdminAccountPage({ params }: PageProps<'/admin/users/[id]'>) {
  const { id } = await params;
  return <AccountScreen id={id} />;
}
