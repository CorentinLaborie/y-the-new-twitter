import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MfaSetupForm } from './mfa-setup-form';

export const metadata: Metadata = {
  title: 'Administration — Double authentification',
};

/**
 * Set-up of the back-office second factor, from the link sent by e-mail after a correct password. Outside the console
 * guard: the session is not signed in until the first code is confirmed.
 */
export default function AdminMfaSetupPage() {
  return (
    <Suspense fallback={null}>
      <MfaSetupForm />
    </Suspense>
  );
}
