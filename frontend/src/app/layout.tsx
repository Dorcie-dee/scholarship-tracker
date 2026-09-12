import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Syne, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const sans = Plus_Jakarta_Sans({
  variable: '--font-sans-loaded',
  subsets: ['latin'],
  display: 'swap',
});

const display = Syne({
  variable: '--font-display-loaded',
  subsets: ['latin'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  variable: '--font-mono-loaded',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Scholarship OS',
    template: '%s · Scholarship OS',
  },
  description:
    'Plan journeys, track applications, and never miss a scholarship deadline — the operating system for ambitious applicants.',
  openGraph: {
    title: 'Scholarship OS',
    description: 'The operating system for scholarship and admission applications.',
    type: 'website',
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
