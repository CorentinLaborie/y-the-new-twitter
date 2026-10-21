import type { Metadata } from 'next';
import { ReportScreen } from '@/components/admin/report-screen';

export const metadata: Metadata = {
  title: 'Administration — Examen du signalement',
};

export default async function AdminReportPage({ params }: PageProps<'/admin/reports/[id]'>) {
  const { id } = await params;
  return <ReportScreen id={id} />;
}
