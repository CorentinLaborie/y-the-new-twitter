import type { Metadata } from 'next';
import { DashboardScreen } from '@/components/admin/dashboard-screen';

export const metadata: Metadata = {
  title: 'Administration — Tableau de bord',
};

export default function AdminDashboardPage() {
  return <DashboardScreen />;
}
