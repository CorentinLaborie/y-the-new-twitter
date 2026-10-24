import type { Metadata } from 'next';
import { PasswordForm } from '@/components/settings/password-form';

export const metadata: Metadata = { title: 'Mot de passe — Paramètres — Y' };

/** Changing the password of the signed-in account (plan L5, step 5). */
export default function PasswordPage() {
  return (
    <section aria-labelledby="password-title">
      <h1 id="password-title">Mot de passe</h1>
      <PasswordForm />
    </section>
  );
}
