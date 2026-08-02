import type { Viewport } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { mediaUrl, renderBrandingStyle } from '@ayman/ui/branding';
import { plexArabic, plexMono } from '@/lib/fonts';
import { getBranding } from '@/lib/settings';
import { THEME_SCRIPT } from '@/lib/security/theme-script';
import { MotionProvider } from '@/components/motion/motion-provider';
import { RouteProgress } from '@/components/motion/route-progress';
import { DotGridSpotlight } from '@/components/dot-grid-spotlight';
import { SplashCursorMount } from '@/components/site/splash-cursor-mount';
import { JsonLd } from '@/components/seo/json-ld';
import { organizationJsonLd, personJsonLd, webSiteJsonLd } from '@/lib/seo/jsonld';
import { rootMetadata } from '@/lib/seo/metadata';
import { Toaster } from '@/components/toaster';
import './globals.css';

/**
 * Static, not `generateMetadata` — deliberately.
 *
 * `metadataBase` must be present before any CHILD's metadata is resolved, and
 * the root layout is on the path of `/_not-found`, which Next prerenders at
 * build time. Keeping this half free of I/O means the one field everything
 * else depends on can never be missing because an API was slow. The
 * admin-editable half (title/description/OG image) is applied per page by
 * `buildMetadata()`, which a child's `generateMetadata` awaits and which
 * overrides these defaults where it is used.
 */
export const metadata = rootMetadata;

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
        {/*
          The pointer-trail fluid, mounted at the root so it is present on every
          route — landing, catalog, dashboard, quizzes and admin alike.

          It is `pointer-events: none` and self-disables under reduced motion
          and on coarse pointers, so it cannot intercept input and never runs on
          phones. It IS still a continuous WebGL simulation on every page: if it
          proves distracting during a graded quiz attempt, or too costly on the
          admin tables, move this mount down into `app/(site)/layout.tsx` and it
          becomes marketing-only with no other change.
        */}
        <SplashCursorMount />
        {/*
          Three entities, on every page, cross-referenced by stable `@id`:

          · `WebSite`     — the site, and its alternate names.
          · `Organization`— the platform (an `EducationalOrganization`).
          · `Person`      — أيمن أبو العلا himself.

          The `Person` is not decoration. "أيمن أبو العلا" is a NAME query, and
          a site describing only an organisation gives a crawler nothing to
          match one against. All three carry the same `alternateName` list
          (including the hamza-less spellings students actually type) — three
          independent assertions of the same fact, which is what it takes.

          Emitted from the ROOT layout so they appear on the marketing pages
          AND on `/dashboard`, `/quizzes`, `/admin`. That is harmless: those
          routes carry `noindex` (see `privateRouteMetadata`), so nothing here
          reaches an index from them, and keeping the mount in one place is
          worth more than saving a few hundred bytes on screens a crawler
          never sees.
        */}
        <JsonLd data={webSiteJsonLd()} />
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={personJsonLd()} />
        {/*
          nuqs needs its adapter above every `useQueryState` in the tree. It is
          mounted once, at the root, rather than per route group: a second
          adapter deeper in the tree makes the two halves of the app disagree
          about what the URL currently says.
        */}
        <NuqsAdapter>
          <MotionProvider>
            <RouteProgress>{children}</RouteProgress>
          </MotionProvider>
        </NuqsAdapter>
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
