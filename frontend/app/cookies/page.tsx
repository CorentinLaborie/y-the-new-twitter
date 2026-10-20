import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/legal-document';

export const metadata: Metadata = {
  title: 'Utilisation des cookies — Y',
};

export default function CookiesPage() {
  return (
    <LegalDocument title="Utilisation des cookies">
      <p>
        Ce site est un faux site permettant de montrer mes compétences de développeur Web. Ce site est donc
        non-lucratif.
      </p>
      <p>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et
        dolore magna aliqua.
      </p>
      <p>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et
        dolore magna aliqua.
      </p>
    </LegalDocument>
  );
}
