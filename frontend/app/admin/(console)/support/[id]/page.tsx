import type { Metadata } from 'next';
import { SupportThreadScreen } from '@/components/admin/support-thread-screen';

export const metadata: Metadata = {
  title: 'Administration — Message du tribunal des bannis',
};

export default async function AdminSupportThreadPage({ params }: PageProps<'/admin/support/[id]'>) {
  const { id } = await params;
  return <SupportThreadScreen id={id} />;
}
