import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminLoginForm } from './admin-login-form';

export const metadata: Metadata = {
  title: 'Administration — Connexion',
};

/** Back-office sign-in with the email and the password. Outside the console guard. */
export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
