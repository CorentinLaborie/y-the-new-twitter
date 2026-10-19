import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { CodeForm } from './code-form';

export const metadata: Metadata = {
  title: 'Code de validation — Y',
};

export default function SignupCodePage() {
  return (
    <AuthShell
      title="Nous rejoindre ?"
      accent="Pourquoi pas ?"
      backLink={{ href: '/signup', label: 'Retour' }}
      footnote="En vous inscrivant, vous acceptez nos Conditions d’utilisation, notre Politique de confidentialité et notre Utilisation des cookies."
    >
      {/* The form reads the e-mail from the URL, which needs a Suspense boundary (Cache Components). */}
      <Suspense fallback={null}>
        <CodeForm />
      </Suspense>
    </AuthShell>
  );
}
