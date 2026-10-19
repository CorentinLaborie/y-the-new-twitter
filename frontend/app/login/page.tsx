import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { buttonClassName } from '@/components/auth/button';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Connexion — Y',
};

export default function LoginPage() {
  return (
    <AuthShell
      title="On ne demande jamais assez"
      accent="Pourquoi ?"
      secondary={
        <Link href="/signup" className={buttonClassName('secondary')}>
          Rejoindre la communauté
        </Link>
      }
      footnote="En vous connectant, vous acceptez nos Conditions d’utilisation, notre Politique de confidentialité et notre Utilisation des cookies."
    >
      {/* The form reads the confirmation and the e-mail from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
