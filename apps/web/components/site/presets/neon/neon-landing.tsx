import { Fragment } from 'react';
import type { HomeBlock, HomeBlockList } from '@ayman/contracts/admin/home-blocks';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { JsonLd } from '@/components/seo/json-ld';
import { faqPageJsonLd } from '@/lib/seo/jsonld';
import { NeonHero } from './neon-hero';
import { NeonWhy } from './neon-why';
import { NeonSteps } from './neon-steps';
import { NeonCourses } from './neon-courses';
import { NeonBooks } from './neon-books';
import { NeonTracks } from './neon-tracks';
import { NeonInstructor } from './neon-instructor';
import { NeonHonorBoard } from './neon-honor-board';
import { NeonAbout } from './neon-about';
import { NeonStats } from './neon-stats';
import { NeonTestimonials } from './neon-testimonials';
import { NeonFaq } from './neon-faq';
import { NeonCta } from './neon-cta';

/**
 * «الترمينال» — the landing page for `branding.landingPreset === 'neon'`.
 *
 * ## What it is
 *
 * A page that never turns light. There are no light sections, no tinted bands
 * and no stage: one dark ground from the header to the footer, with sections
 * separated by glowing hairlines rather than by a change of background. Arabic
 * carries every word; the monospace face carries every number, key and marker,
 * each of them bidi-isolated. Cards are code windows. Buttons read like
 * commands.
 *
 * It is not a recolour of the classic page and shares no component with it.
 * What it DOES share is every loader and every rule about the data —
 * `getCatalogOrEmpty`, `getBookCatalogOrEmpty`, `getBranding`, the curation
 * order, the `showOnLanding`-before-slice ordering, the price precedence — so
 * the two pages cannot disagree about a fact, only about how it looks.
 *
 * ## Contract with `page.tsx`
 *
 * `{ blocks, honorBoard }`, default export, async server component. It gets the
 * SAME published rows the classic page gets — a preset is a different way of
 * presenting the tenant's list, never a different list — and it is imported
 * only inside `page.tsx`'s own `neon` branch, through an `await import()`, so
 * nothing in this module graph is evaluated on a render that is not on this
 * preset. That is what keeps Ayman's page byte-identical.
 *
 * ## Nothing of Ayman's is reachable from here
 *
 * Not by convention — by import graph. `lib/brand-assets.ts` (his photograph,
 * his dragon, his monogram) is imported by no file in this directory;
 * `copy.landing` — his hero lines, his eight reasons, his ten FAQ answers — is
 * imported by no file in this directory; the only name printed anywhere on the
 * page comes through `tenantName()`, which returns the deployment's own
 * display name on any stack that is not his. The images that DO appear are the
 * tenant's own `logoDarkAssetId` / `logoLightAssetId`, with a drawn `</>`
 * monogram as a designed fallback for the very common case of a stack whose
 * owner has not opened /admin/settings yet.
 *
 * ## The page renders correctly with an empty database, because that is day one
 *
 * A new instructor has no courses and no books, and `NEUTRAL_FALLBACK_BLOCKS`
 * is what their empty `home_blocks` table serves: hero, courseGrid, yearTracks.
 * So the first screen their students ever see is composed for exactly that:
 *
 *   · the opener stands on its own — a mark, the prompt, the headline and two
 *     commands need no content behind them;
 *   · `<NeonCourses>` draws a DESIGNED empty state (an `ls` that returns
 *     nothing, then what happens next, then the one action still worth taking)
 *     rather than the `null` the classic strip returns;
 *   · `<NeonTracks>` stands down entirely, so there is never a second «لسه
 *     فاضي» panel under the first — two of them read as a broken site;
 *   · `<NeonSteps>` closes the page with how the platform works, which is true
 *     before a single row exists.
 *
 * ## Every block type is handled, including the ones that render nothing
 *
 * All twelve have a case below. Three of them can decide to render nothing,
 * and each decision is stated where it is made rather than here: `books` on an
 * empty shop (`<NeonBooks>` — most instructors never sell one, and «لسه مفيش
 * كتب» apologises for a product nobody was promised), `yearTracks` on an empty
 * catalogue (above), and `testimonials` / `stats` / `faq` on an empty item
 * list, which their own schemas make impossible to store but which a defensive
 * `length === 0` covers anyway. Nothing is dropped silently.
 */
export default async function NeonLanding({
  blocks,
  honorBoard,
}: {
  blocks: HomeBlockList;
  honorBoard: HonorBoardEntry[];
}) {
  /*
   * WHERE THE PAGE'S ONE `<h1>` GOES.
   *
   * The block list is the tenant's, so nothing here can assume there is a
   * hero: an admin may delete it, or lead with a course grid. A landing page
   * with no `<h1>` at all is an accessibility failure that no test on this
   * repo catches — the axe run in `e2e/a11y.e2e.ts` visits Ayman's page, which
   * always has one — and it is a failure a screen-reader user meets in the
   * first second.
   *
   * So the level is decided once, here, and passed down. The hero owns the h1
   * whenever a hero exists (it is the page's title either way). Otherwise the
   * first block that renders a heading takes it. And if the tenant has
   * published a page of nothing but placement blocks with no heading of their
   * own — possible, if unlikely — `<NeonSteps>` at the foot takes it, which is
   * why `stepsLevel` is computed rather than hardcoded to 2.
   *
   * A section is NOT trusted to work this out from its own props: two `hero`
   * blocks would then be two `<h1>`s, and every one of them would be sure it
   * was right.
   */
  const heroIndex = blocks.findIndex((block) => block.props.type === 'hero');
  const h1Index = heroIndex >= 0 ? heroIndex : blocks.findIndex(hasHeading);
  const stepsLevel: 1 | 2 = h1Index === -1 ? 1 : 2;

  /*
   * `<NeonSteps>` goes immediately BEFORE a trailing `cta`, otherwise last.
   *
   * One rule, because the closing call to action has to close: «how it works»
   * belongs with the questions a reader still has just before deciding, not
   * after they have already been asked to act. See `<NeonSteps>` for why this
   * page carries a section the tenant did not order at all.
   */
  const last = blocks.at(-1);
  const closer = last !== undefined && last.props.type === 'cta' ? last : null;
  const body = closer ? blocks.slice(0, -1) : blocks;

  return (
    /*
     * `data-preset="neon"` is the scope every rule in `presets.css` hangs off,
     * and it is the reason a selector there can never match Ayman's page: his
     * `<main>` carries `data-layout` and nothing else, and `page.tsx` is tested
     * for the absence of this exact attribute (`lib/landing-preset.test.ts`).
     *
     * It is the ONLY hook, deliberately — no companion `className`. A class
     * here would be a second name for the same thing, and the day one of them
     * is used in a selector and the other is not is the day a rule stops
     * matching for a reason nobody can see in the markup.
     *
     * `<main>` and not a `<div>`: this is the page's main landmark, and it is
     * the only one — `<SiteNav>` supplies the banner and its own `<nav>`,
     * `<SiteFooter>` the contentinfo. Every section below is a real
     * `<section>` with a heading in it.
     */
    <main data-preset="neon">
      {body.map((block, index) => renderNeonBlock(block, honorBoard, index === h1Index ? 1 : 2))}
      <NeonSteps level={stepsLevel} />
      {closer ? renderNeonBlock(closer, honorBoard, blocks.length - 1 === h1Index ? 1 : 2) : null}
    </main>
  );
}

/**
 * Does this block render a heading a reader could hang the page's title on?
 *
 * Only asked when there is no `hero`. The three placement blocks always do —
 * their headings are this preset's own (`«اختار صفّك»`, `«مين اللي بيشرح؟»`,
 * `«لوحة الشرف»`) and cannot be blank. The content blocks depend on what an
 * editor typed: `StatsPropsSchema.titleAr`, `TestimonialsPropsSchema.titleAr`
 * and `FaqPropsSchema.titleAr` all default to `''`, and a section whose title
 * is empty renders no heading element at all, so it cannot be the h1.
 */
function hasHeading(block: HomeBlock): boolean {
  const { props } = block;

  switch (props.type) {
    case 'instructor':
    case 'yearTracks':
    case 'honorBoard':
      return true;
    case 'hero':
      return props.headlineAr.length > 0;
    case 'cta':
      return props.headlineAr.length > 0;
    case 'whyRail':
    case 'courseGrid':
    case 'books':
    case 'about':
      return props.titleAr.length > 0;
    case 'stats':
    case 'testimonials':
    case 'faq':
      return props.titleAr.length > 0;
  }
}

/**
 * One stored block → one section.
 *
 * Exhaustive over `HomeBlockProps['type']`: there is no `default` arm, so
 * adding a thirteenth block type to the contract is a TYPE ERROR here rather
 * than a section that silently stops rendering on this preset. That is the
 * same shape `page.tsx`'s own `renderBlock` uses, deliberately.
 */
function renderNeonBlock(block: HomeBlock, honorBoard: HonorBoardEntry[], level: 1 | 2) {
  const { props } = block;

  switch (props.type) {
    case 'hero':
      return (
        <NeonHero
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
          level={level}
        />
      );

    case 'whyRail':
      return (
        <NeonWhy
          key={block.id}
          title={props.titleAr}
          titleAccent={props.titleAccentAr}
          lead={props.leadAr}
          leadSecondary={props.leadSecondaryAr}
          items={props.items}
          level={level}
        />
      );

    case 'courseGrid':
      return (
        <NeonCourses
          key={block.id}
          title={props.titleAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          limit={props.limit}
          courseIds={props.courseIds}
          level={level}
        />
      );

    case 'books':
      return (
        <NeonBooks
          key={block.id}
          title={props.titleAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          limit={props.limit}
          level={level}
        />
      );

    /* Placement-only: the block says where the section sits and nothing else,
       so these three take no content props. Each builds itself from the
       tenant's own data — the catalogue, the branding assets, the exam
       results — which is what makes them true on a stack nobody has written a
       word for yet. */
    case 'instructor':
      return <NeonInstructor key={block.id} level={level} />;

    case 'yearTracks':
      return <NeonTracks key={block.id} level={level} />;

    case 'honorBoard':
      return <NeonHonorBoard key={block.id} entries={honorBoard} level={level} />;

    case 'about':
      return (
        <NeonAbout
          key={block.id}
          title={props.titleAr}
          body1={props.body1Ar}
          body2={props.body2Ar}
          role={props.roleAr}
          chips={props.chipsAr}
          level={level}
        />
      );

    case 'stats':
      return <NeonStats key={block.id} title={props.titleAr} items={props.items} level={level} />;

    case 'testimonials':
      return (
        <NeonTestimonials
          key={block.id}
          title={props.titleAr}
          items={props.items}
          level={level}
        />
      );

    case 'faq':
      /*
       * The structured data sits INSIDE this case, not at page level, for the
       * reason `page.tsx` states: fed `props.items`, it describes the rows
       * this block actually renders and it cannot outlive the section.
       * Unpublish the FAQ and the markup advertising its answers leaves with
       * it, instead of promising a crawler answers the page no longer shows.
       */
      return (
        <Fragment key={block.id}>
          <JsonLd data={faqPageJsonLd(props.items)} />
          <NeonFaq
            title={props.titleAr}
            eyebrow={props.eyebrowAr}
            rows={props.items}
            level={level}
          />
        </Fragment>
      );

    case 'cta':
      return (
        <NeonCta
          key={block.id}
          headline={props.headlineAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          ctaHref={props.ctaHref}
          level={level}
        />
      );
  }
}
