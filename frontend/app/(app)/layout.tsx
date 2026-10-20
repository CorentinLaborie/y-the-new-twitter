import { Suspense, type ReactNode } from 'react';
import { SuspendedBanner } from '@/components/banner/suspended-banner';
import { requireSession } from './session-guard';

/** Protected area: every page below needs a session. Guests are sent to /login (rule F9). */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SessionGate>{children}</SessionGate>
    </Suspense>
  );
}

/** Reads the session inside Suspense: the session comes from the request (NEXTJS-DIGEST, runtime APIs). */
async function SessionGate({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <>
      <SuspendedBanner />
      {children}
    </>
  );
}
