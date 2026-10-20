import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/legal-document';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Y',
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Politique de confidentialité">
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
