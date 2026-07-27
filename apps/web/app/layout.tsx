import type { Metadata, Viewport } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { copy } from '@ayman/contracts';
import { mediaUrl, renderBrandingStyle } from '@ayman/ui/branding';
import { plexArabic, plexMono } from '@/lib/fonts';
import { getBranding } from '@/lib/settings';
import { THEME_SCRIPT } from '@/lib/security/theme-script';
import { DotGridSpotlight } from '@/components/dot-grid-spotlight';
import { JsonLd } from '@/components/seo/json-ld';
import { organizationJsonLd } from '@/lib/seo/jsonld';
import { Toaster } from '@/components/toaster';
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();

  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/*
          Branding overrides ship inline, from a `'use cache'` loader tagged
          `settings:branding` — no FOUC and no build step.

          The string is machine-generated from a fixed lookup table and every
          declaration is asserted against SAFE_DECLARATION inside
          renderBrandingStyle; no editor-supplied text can reach it, because
          the editor picks a SLOT from an enum and never types a colour
          (Global Constraint 18 / A12). The CSP is explicitly NOT the control
          here — an inline <style> needs style-src 'unsafe-inline', which Next
          already requires for its own streaming style injection.
        */}
        <style dangerouslySetInnerHTML={{ __html: renderBrandingStyle(branding) }} />
        {branding.faviconAssetId ? (
          <link rel="icon" href={mediaUrl(`${branding.faviconAssetId}.webp`)} type="image/webp" />
        ) : null}
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
        {/*
          The single `<Toaster/>` mount in the product (B5). It used to live
          in `app/(admin)/layout.tsx`, but `(app)` and `(admin)` are SIBLING
          route groups — that layout is not an ancestor of `/quizzes/*`, so
          every failure toast a student could hit during a graded attempt
          rendered nothing at all. The root layout is an ancestor of every
          route group, so this is the one place a single mount reaches both
          areas. Do not add a second mount anywhere else — two mounts render
          every toast twice.
        */}
        <Toaster />
      </body>
    </html>
  );
}
