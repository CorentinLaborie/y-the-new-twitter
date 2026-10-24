import type { Metadata } from 'next';
import { EmailChangeForm } from '@/components/settings/email-change-form';

export const metadata: Metadata = { title: 'Adresse e-mail — Paramètres — Y' };

/** Changing the e-mail address of the signed-in account, in two steps (plan L5, step 6). */
export default function EmailPage() {
  return (
    <section aria-labelledby="email-title">
      <h1 id="email-title">Adresse e-mail</h1>
      <EmailChangeForm />
    </section>
  );
}
