import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Merriweather } from 'next/font/google';
import '../styles/tokens.css';
import '../styles/design-system.css';
import './globals.css';

// Font families of styles/tokens.json (type.families). Self-hosted at build time (Next.js font loader).
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});
const merriweather = Merriweather({ variable: '--font-merriweather', subsets: ['latin'], weight: ['400'] });
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '600'],
});

export const metadata: Metadata = {
  title: 'Y',
  description: 'Y, le réseau social qui vous fait réfléchir.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className={`${inter.variable} ${merriweather.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
