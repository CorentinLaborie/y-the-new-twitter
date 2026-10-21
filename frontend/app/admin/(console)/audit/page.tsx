import type { Metadata } from 'next';
import { AuditScreen } from '@/components/admin/audit-screen';

export const metadata: Metadata = {
  title: 'Administration — Journal d’audit',
};

export default function AdminAuditPage() {
  return <AuditScreen />;
}
