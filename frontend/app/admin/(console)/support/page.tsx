import type { Metadata } from 'next';
import { SupportScreen } from '@/components/admin/support-screen';

export const metadata: Metadata = {
  title: 'Administration — Tribunal des bannis',
};

export default function AdminSupportPage() {
  return <SupportScreen />;
}
