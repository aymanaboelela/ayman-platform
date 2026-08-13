import type { Viewport } from 'next';
import { Suspense } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { mediaUrl, renderBrandingStyle } from '@ayman/ui/branding';
import { plexArabic, plexMono } from '@/lib/fonts';
import { getBranding } from '@/lib/settings';
import { PREPAINT_SCRIPT } from '@/lib/security/prepaint-script';
import { MotionProvider } from '@/components/motion/motion-provider';
import { RouteProgress } from '@/components/motion/route-progress';
import { JsonLd } from '@/components/seo/json-ld';
import { organizationJsonLd, personJsonLd, webSiteJsonLd } from '@/lib/seo/jsonld';
import { rootMetadata } from '@/lib/seo/metadata';
import { Toaster } from '@/components/toaster';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';
import { Clarity } from '@/components/analytics/clarity';
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
    /*
      `suppressHydrationWarning` is REQUIRED here, and only here.

      `PREPAINT_SCRIPT` runs in `<head>` and writes `data-theme` / `data-rail`
      onto this element before React exists — that is its entire purpose, and
      it cannot be done any later without the white flash and the rail jump it
      was written to prevent. React then hydrates, finds attributes on `<html>`
      that the server never rendered, and reports a mismatch it cannot patch.

      The warning is correct about the facts and wrong about the conclusion:
      the two attributes are read by CSS alone and are never React state (see
      the header of `lib/security/prepaint-script.ts`), so there is nothing for
      React to reconcile. This suppresses the diff for THIS element's own
      attributes and one level of text — it does not extend to the tree below,
      so a real mismatch anywhere in the app still reports normally.
    */
    <html
      lang="ar"
      dir="rtl"
      className={`${plexArabic.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
        {/*
          The media origin is a SEPARATE host by architectural requirement, not
          by accident — see `mediaUrl()` in packages/ui/src/lib/branding.ts
          ("a DIFFERENT origin from the app on purpose (A10)"), which the API
          enforces by refusing to boot if it matches APP_URL. Every course
          cover on the signed-in surface comes from it
          (components/course-art.tsx renders a raw <img src={mediaUrl(...)}>),
          as does the branded favicon below.

          Nothing else in the app hints at that host, so on an Egyptian mobile
          connection at 200-300 ms RTT the first cover pays a cold
          DNS + TCP + TLS handshake — roughly 600-900 ms of dead time before a
          single byte of image. Opening the socket during the head parse moves
          that off the critical path on /dashboard and /library.

          Deliberately WITHOUT `crossOrigin="anonymous"`. Those <img> tags carry
          no crossorigin attribute, so their requests go out in the no-CORS
          credentials pool; an anonymous preconnect opens a socket in the OTHER
          pool, which they cannot reuse. The hint would be wasted and would
          hold a connection open for ~10s for nothing. Fonts need `crossorigin`
          because font fetches are CORS by spec; images do not.
        */}
        <link
          rel="preconnect"
          href={process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? 'http://localhost:3300'}
        />
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
        {/*
          `faviconKey`, NOT `faviconAssetId`.

          This used to pass mediaUrl the asset id with ".webp" glued onto it,
          and an asset id is not a storage key: keys are `<2 hex>/<uuid>.webp`,
          which is the two-segment shape `GET /media/:prefix/:name` routes on.
          A one-segment path matched no route, so every favicon an admin ever
          chose returned 404 — and a 404 on `<link rel="icon">` leaves the
          browser's default globe in the tab, which is indistinguishable from
          never having set one.

          ⚠️ Both spellings TYPE-CHECK — `faviconAssetId` is still a string on
          the resolved shape — which is precisely why this survived: nothing
          but a look at the network tab could tell the two apart. The API now
          resolves the id to the real key server-side (`BrandingReadSchema`),
          and `settings.service.spec.ts` asserts the key contains a slash.
        */}
        {branding.faviconKey ? (
          <link rel="icon" href={mediaUrl(branding.faviconKey)} type="image/webp" />
        ) : null}
      </head>
      <body>
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
        {/*
          Renders nothing — it registers `public/sw.js`, which is the piece
          `app/manifest.ts` has been documenting as missing: Chrome will not
          offer "install" for a manifest alone, however complete, without a
          service worker that has a fetch handler.

          Mounted at the ROOT so the worker is registered on any entry point,
          including the marketing pages a student lands on first. The worker
          itself is deliberately narrow — it caches hashed assets and one
          offline page, and never HTML or `/api` — see its header for why
          that matters on a product people sign into.
        */}
        <ServiceWorkerRegister />
        {/*
          Microsoft Clarity — session recordings and heatmaps, injected by
          `@microsoft/clarity` from the browser. Renders nothing.

          At the ROOT rather than in `(site)`, because the sessions worth
          watching start on a marketing page and continue into the signed-in
          product; a mount that covered only one half would cut every recording
          at the login screen. `/admin` is excluded from inside the component —
          those screens put real students' names, emails and grades on screen,
          and a recording of one is a copy of that data in a third-party
          dashboard.

          Ships nothing at all unless `NEXT_PUBLIC_CLARITY_PROJECT_ID` was set
          at BUILD time (see `apps/web/Dockerfile`).

          ⚠️ The `<Suspense>` is REQUIRED, not stylistic. `<Clarity>` calls
          `usePathname()` to know whether it is on `/admin`, and under
          `cacheComponents: true` (next.config.ts) reading the pathname is
          uncached data. In the ROOT layout that makes it uncached data on the
          path of every page, so `next build` refuses the whole export:

            Route "/admin/questions/[bankEntryId]": Uncached data was accessed
            outside of <Suspense>.

          Not a warning — the build exits 1, and it named this component. A
          boundary with a `null` fallback confines the dynamic hole to a
          component that renders nothing anyway, so all 83 pages keep
          prerendering and the analytics tag stays out of that decision.
        */}
        <Suspense fallback={null}>
          <Clarity />
        </Suspense>
      </body>
    </html>
  );
}
