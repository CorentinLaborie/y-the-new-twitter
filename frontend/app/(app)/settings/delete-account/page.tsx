import type { Metadata } from 'next';
import { DeleteAccountForm } from '@/components/settings/delete-account-form';

export const metadata: Metadata = { title: 'Supprimer mon compte — Paramètres — Y' };

/** Asking for the deletion of the signed-in account (plan L5, step 7). */
export default function DeleteAccountPage() {
  return (
    <section aria-labelledby="delete-title">
      <h1 id="delete-title">Supprimer mon compte</h1>
      <DeleteAccountForm />
    </section>
  );
}
