import type { Metadata } from 'next';
import { ReportsScreen } from '@/components/admin/reports-screen';

export const metadata: Metadata = {
  title: 'Administration — Signalements',
};

export default function AdminReportsPage() {
  return <ReportsScreen />;
}
