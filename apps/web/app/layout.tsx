import type { Metadata, Viewport } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { copy } from '@ayman/contracts';
import { plexArabic, plexMono } from '@/lib/fonts';
import { THEME_SCRIPT } from '@/lib/security/theme-script';
import { DotGridSpotlight } from '@/components/dot-grid-spotlight';
import { JsonLd } from '@/components/seo/json-ld';
import { organizationJsonLd } from '@/lib/seo/jsonld';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${copy.site.name} — ${copy.site.tagline}`, template: `%s | ${copy.site.name}` },
  description: copy.site.tagline,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FCFCFD' },
    { media: '(prefers-color-scheme: dark)', color: '#08090A' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="dot-grid" aria-hidden="true" />
        <DotGridSpotlight />
        <JsonLd data={organizationJsonLd()} />
        {/*
          nuqs needs its adapter above every `useQueryState` in the tree. It is
          mounted once, at the root, rather than per route group: a second
          adapter deeper in the tree makes the two halves of the app disagree
          about what the URL currently says.
        */}
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
