import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Inscription — Y',
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Nous rejoindre ?"
      accent="Pourquoi pas ?"
      backLink={{ href: '/login', label: 'Retour' }}
      footnote="En vous inscrivant, vous acceptez nos Conditions d’utilisation, notre Politique de confidentialité et notre Utilisation des cookies."
    >
      <SignupForm />
    </AuthShell>
  );
}
