import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminLoginForm } from './admin-login-form';

export const metadata: Metadata = {
  title: 'Administration — Connexion',
};

/** Back-office sign-in: the password, then the second factor (a code or a backup code). Outside the console guard. */
export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
