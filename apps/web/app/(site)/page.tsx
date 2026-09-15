import { getBranding } from '@/lib/settings';
import { Fragment } from 'react';
import { cacheLife } from 'next/cache';
import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import type { HomeBlock } from '@ayman/contracts/admin/home-blocks';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata } from '@/lib/seo/metadata';
import { faqPageJsonLd } from '@/lib/seo/jsonld';
import { getHomeBlocks, getHonorBoard } from '@/lib/home-blocks';
import { SiteHero } from '@/components/site/site-hero';
import { WhyRail } from '@/components/site/why-rail';
import { FeaturedCourses } from '@/components/site/featured-courses';
import { BooksStrip } from '@/components/site/books-strip';
import { InstructorProfile } from '@/components/site/instructor-profile';
import { YearTracks } from '@/components/site/year-tracks';
import { HonorBoardSection } from '@/components/site/honor-board-section';
import { AboutInstructor } from '@/components/site/about-instructor';
import { SiteStats } from '@/components/site/site-stats';
import { SiteTestimonials } from '@/components/site/site-testimonials';
import { SiteCta } from '@/components/site/site-cta';
import { SiteFaq } from '@/components/site/site-faq';

/**
 * The landing page is the published `home_blocks` list, rendered in order.
 *
 * It used to be a hardcoded composition, which meant /admin/home was a
 * composer over rows nothing read. Now the admin genuinely owns the page:
 * order, publish state, and — for every block type that carries copy — the
 * words themselves.
 *
 * Two things stay out of the database on purpose:
 *
 * · **The section components.** A block chooses which component renders and
 *   what it says; it does not describe layout. There is no generic block
 *   renderer here that could ever produce an unstyled page.
 * · **`instructor`, `yearTracks` and `honorBoard`.** Those build themselves —
 *   from the catalogue, the taxonomy, and the monthly exam's results — so
 *   their blocks carry no props at all: the admin decides where they sit and
 *   whether they run, nothing else. See
 *   `packages/contracts/src/admin/home-blocks.ts`.
 *
 * `getHomeBlocks()` never throws and never returns an empty list: an empty
 * table or an unreachable API both fall back to `DEFAULT_HOME_BLOCKS`, the
 * shipped page. This route therefore has no failure mode where it renders
 * nothing.
 *
 * ## One route, three pages
 *
 * `branding.landingPreset` decides which page component renders these blocks
 * — see `LandingPresetSchema`. The blocks themselves are the same rows either
 * way: a preset is a different way of PRESENTING the tenant's published list,
 * never a different list. `classic` is the default, is what every stored row
 * means, and is the arm below `renderBlock` serves; the alternates own their
 * own component under `components/site/presets/` and are imported only inside
 * their own branch.
 */
/**
 * The one page whose title does NOT get the `%s | منصة أيمن أبو العلا`
 * suffix — `copy.seo.defaultTitle` already ends in the platform name, and
 * "منصة أيمن أبو العلا | منصة أيمن أبو العلا" is how a landing page gets its
 * title rewritten by Google. Passing no `title` lets the root layout's
 * `title.default` (or the admin's override) stand on its own.
 */
export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ path: '/', description: copy.seo.homeDescription });
}

/**
 * ⚠️ `'use cache'` on the page itself, and it is load-bearing for more than
 * speed.
 *
 * Without it this component is dynamic — it awaits two loaders — so Next
 * prerendered only the shell and streamed the whole page in afterwards. In a
 * browser that is invisible. In the HTML as delivered, it meant the skeleton
 * came first, the FOOTER came second, and the page's `<h1>` arrived last,
 * about 31 KB in. Every crawler that does not execute JavaScript — which is
 * most of the AI ones — read the document in that order, and an AI-readiness
 * scan on 2026-09-13 reported it could not tell what the site was for.
 *
 * Both loaders are already `'use cache'` with `cacheLife('minutes')`, and both
 * call `cacheTag` — tags from a nested cache entry propagate to the one that
 * contains it, so `updateTag(tags.homeBlocks())` from the admin still lands
 * here immediately. This adds no new staleness; it only lets the render itself
 * be reused instead of repeated.
 *
 * ⚠️ Nothing in this tree may read `cookies()`, `headers()` or `connection()`.
 * The landing page is the same page for everyone — it has no signed-in variant
 * — and the day one of these sections needs a per-request value, it goes in its
 * own `<Suspense>` rather than this directive coming off.
 */
export default async function HomePage() {
  'use cache';
  cacheLife('minutes');

  /*
   * Both reads, together. `getHonorBoard` fails soft to an empty array and the
   * board renders its reserved places for that, so there is nothing to guard
   * here — and issuing it in parallel keeps a board nobody has filled yet from
   * adding a round trip to the landing page's LCP path.
   */
  const [blocks, honorBoard, branding] = await Promise.all([
    getHomeBlocks(),
    getHonorBoard(),
    getBranding(),
  ]);

  /*
   * WHICH page, decided before anything below it runs.
   *
   * ⚠️ Read the two branches as one rule: `classic` must fall THROUGH to the
   * return statement underneath, untouched. That statement, `renderBlock`, and
   * every component they reach are exactly what Ayman's platform renders
   * today, and the only acceptable diff on his page is none — «منصتي زي ما هي
   * بالظبط». So the alternates are early returns bolted on ABOVE it rather
   * than a three-way `switch` that would have required rewriting the classic
   * arm to sit inside it. Nothing here re-orders the loaders, adds an
   * attribute to his `<main>`, or introduces a second place his page is
   * described.
   *
   * ## Why `await import()` and not a top-level import
   *
   * A static import of both preset pages would put their whole module graph
   * into this route's server bundle and EVALUATE it on every landing-page
   * render — including Ayman's. Module-level evaluation is not free and, worse,
   * it is not inert: a preset component that imports a stylesheet of its own,
   * or references a client component, gets those effects hoisted into the
   * route whether or not the branch ever runs. That is precisely the class of
   * change that ends with `classic` picking up one CSS rule nobody wrote for
   * it. A dynamic import inside the branch cannot: the module is fetched and
   * evaluated the first time a tenant on that preset renders, and never on a
   * tenant who is on `classic`.
   *
   * The cost is one extra chunk load on the FIRST render for those two
   * tenants, which is then held by this function's own `'use cache'` entry for
   * the whole `cacheLife('minutes')` window — paid by the tenants who chose a
   * different page, not by the one who did not.
   *
   * `next/dynamic` is deliberately not used: it is a client-side lazy
   * boundary, it cannot take `ssr: false` inside a server component, and there
   * is nothing here to suspend — a plain `await import()` in an async server
   * component is the server-side spelling.
   */
  if (branding.landingPreset === 'neon') {
    const { default: NeonLanding } = await import('@/components/site/presets/neon/neon-landing');
    return <NeonLanding blocks={blocks} honorBoard={honorBoard} />;
  }

  if (branding.landingPreset === 'board') {
    const { default: BoardLanding } = await import('@/components/site/presets/board/board-landing');
    return <BoardLanding blocks={blocks} honorBoard={honorBoard} />;
  }

  /*
   * The page's SHAPE, chosen per instructor from /admin/settings.
   *
   * One attribute, and `styles/layouts.css` answers it — no block changes and
   * no component takes a new prop. What it moves is the rhythm the sections
   * share: how tall the opener is, whether copy sits ranged or centred,
   * whether content sits in raised cards or between hairlines.
   *
   * `classic` has no rules in that file at all, so this attribute is inert on
   * Ayman's page — which is the point. Choosing the default cannot change what
   * he already has.
   *
   * Only `classic` ever gets this far: the two presets above returned their
   * own page. That is why `landingLayout` needs no "does this preset use it?"
   * check anywhere — the question cannot be asked on a page that never ran.
   */
  return (
    <main data-layout={branding.landingLayout}>
      {blocks.map((block) => renderBlock(block, honorBoard))}
    </main>
  );
}

function renderBlock(block: HomeBlock, honorBoard: HonorBoardEntry[]) {
  const { props } = block;

  switch (props.type) {
    case 'hero':
      return (
        <SiteHero
          key={block.id}
          eyebrow={props.eyebrowAr}
          headline={props.headlineAr}
          subheadline={props.subheadlineAr}
          rotating={props.rotatingAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          ctaHref={props.ctaHref}
          secondaryCtaLabel={props.secondaryCtaLabelAr}
          secondaryCtaHref={props.secondaryCtaHref}
          stats={props.stats}
        />
      );

    case 'whyRail':
      return (
        <WhyRail
          key={block.id}
          title={props.titleAr}
          titleAccent={props.titleAccentAr}
          lead={props.leadAr}
          leadSecondary={props.leadSecondaryAr}
          items={props.items}
        />
      );

    case 'courseGrid':
      return (
        <FeaturedCourses
          key={block.id}
          title={props.titleAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          limit={props.limit}
          courseIds={props.courseIds}
        />
      );

    case 'books':
      return (
        <BooksStrip
          key={block.id}
          title={props.titleAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          limit={props.limit}
        />
      );

    case 'instructor':
      return <InstructorProfile key={block.id} />;

    case 'yearTracks':
      return <YearTracks key={block.id} />;

    /* Placement-only like the two above, and currently a placeholder: the
       board fills from the monthly exam and the first paper has not been sat.
       It takes no props today and will take none when the real standings land
       — see `<HonorBoardSection>` for why that is what lets the later slice
       replace it without touching a stored row. */
    /* The one block that now takes data. It stays placement-only in the
       STORED row — `{ type: 'honorBoard' }` and nothing else — so a row an
       admin positioned months ago keeps working; the names are fetched by the
       page and handed down, never stored in the block's props. */
    case 'honorBoard':
      return <HonorBoardSection key={block.id} entries={honorBoard} />;

    case 'about':
      return (
        <AboutInstructor
          key={block.id}
          title={props.titleAr}
          body1={props.body1Ar}
          body2={props.body2Ar}
          role={props.roleAr}
          chips={props.chipsAr}
        />
      );

    case 'stats':
      return <SiteStats key={block.id} title={props.titleAr} items={props.items} />;

    case 'testimonials':
      return <SiteTestimonials key={block.id} title={props.titleAr} items={props.items} />;

    case 'faq':
      /**
       * The only block that emits structured data, because it is the only one
       * whose content is shaped like a question an assistant gets asked. The
       * `JsonLd` sits INSIDE the case rather than at the page level so it is
       * fed `props.items` — the rows this block actually renders — and cannot
       * outlive the section: unpublish the FAQ and the markup describing it
       * leaves with it, instead of advertising answers the page no longer
       * shows. See `faqPageJsonLd`.
       */
      return (
        <Fragment key={block.id}>
          <JsonLd data={faqPageJsonLd(props.items)} />
          <SiteFaq title={props.titleAr} eyebrow={props.eyebrowAr} rows={props.items} />
        </Fragment>
      );

    case 'cta':
      return (
        <SiteCta
          key={block.id}
          headline={props.headlineAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          ctaHref={props.ctaHref}
        />
      );
  }
}
