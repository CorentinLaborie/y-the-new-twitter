import { Suspense, type ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { requireAdminSession } from './session-guard';

/** Back-office console: every page below needs an administrator session. Others are sent to the login screen. */
export default function AdminConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminSessionGate>{children}</AdminSessionGate>
    </Suspense>
  );
}

/** Reads the session inside Suspense: the session comes from the request (NEXTJS-DIGEST, runtime APIs). */
async function AdminSessionGate({ children }: { children: ReactNode }) {
  const session = await requireAdminSession();
  return <AdminShell user={session.user}>{children}</AdminShell>;
}
