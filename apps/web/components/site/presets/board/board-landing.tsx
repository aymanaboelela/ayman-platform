import { Fragment } from 'react';
import { copy } from '@ayman/contracts/copy';
import type { HomeBlock, HomeBlockList } from '@ayman/contracts/admin/home-blocks';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import type { BrandingRead } from '@ayman/contracts/admin/settings';
import { JsonLd } from '@/components/seo/json-ld';
import { faqPageJsonLd } from '@/lib/seo/jsonld';
import { getBranding } from '@/lib/settings';
import { tenantName } from '@/lib/tenant';
import { BoardPanel } from './board-panel';
import { BoardFeatures } from './board-features';
import { BoardYears } from './board-years';
import { BoardCourses } from './board-courses';
import { BoardBooks } from './board-books';
import { BoardInstructor } from './board-instructor';
import { BoardHonors } from './board-honors';
import { BoardAbout } from './board-about';
import { BoardStats } from './board-stats';
import { BoardQuotes } from './board-quotes';
import { BoardFaq } from './board-faq';
import { BoardCta } from './board-cta';

/**
 * «اللوح» — the `board` landing preset.
 *
 * Solid blocks of the brand colour, everything centred, bright between them,
 * and the year tiles as the loudest object on the page. It renders THE SAME
 * `home_blocks` rows `classic` renders, in the same order — a preset is a
 * different way of presenting the tenant's published list, never a different
 * list.
 *
 * ## It renders all twelve block types
 *
 * Every member of `HomeBlockPropsSchema` has an arm below and none is silently
 * dropped. Four of them are rebuilt rather than reused, and each of those
 * components carries the argument at the top of its own file:
 *
 * · `yearTracks` — `<YearTracks>` is 48 KB of one instructor's identity (his
 *   cut-out, the dragon, his two hand-picked oranges). `<BoardYears>` builds
 *   tiles from the catalogue instead.
 * · `instructor` — `<InstructorProfile>` needs his studio portrait, and falls
 *   back to `DEMO_COURSES` on an empty catalogue, which on a live tenant's
 *   public page is invented courses presented as the catalogue.
 * · `whyRail` — `<WhyRail>` pins the viewport and scrubs cards sideways. A
 *   poster does not take the scroll gesture hostage.
 * · `about` — `<AboutInstructor>` renders his CV (the faculty he read at, the
 *   schools he taught in, the company he worked for) out of the copy table.
 *
 * The other eight are this preset's own components too, but only because the
 * classic ones are written against `sections.css` class names; the DATA and the
 * loaders are shared verbatim — `getCatalogOrEmpty`, `getBookCatalogOrEmpty`,
 * `courseCountLabel`, `formatEGP`, `<CourseArt>`, `<StreamBadge>`,
 * `<UserAvatar>`, and the same three price templates the course page uses.
 *
 * ## One `<main>`, no client boundary anywhere
 *
 * Nothing in this tree is `'use client'`. The entire page is server-rendered
 * HTML: no GSAP, no rotating headline, no pinned rail, no accordion tween, no
 * count-up. That is a design position, not an omission — the three sections
 * that would have needed JavaScript each say so in their own file — and the
 * effect is that the landing page of a brand-new instructor ships zero
 * kilobytes of section JavaScript on its LCP path.
 *
 * ## ⚠️ `classic` cannot reach any of this
 *
 * This module is imported ONLY from inside the `landingPreset === 'board'`
 * branch of `app/(site)/page.tsx`, with a dynamic `await import()`, precisely
 * so that neither this file nor its stylesheet rules are evaluated on a render
 * that is not on this preset. Every selector in the `BOARD` section of
 * `app/(site)/styles/presets.css` is scoped under `[data-preset='board']` —
 * the attribute set on the `<main>` below and nowhere else in the repository —
 * so the shared stylesheet this page downloads cannot match one element on
 * Ayman's page.
 */
export default async function BoardLanding({
  blocks,
  honorBoard,
}: {
  blocks: HomeBlockList;
  honorBoard: HonorBoardEntry[];
}) {
  /*
   * `getBranding()` again, and it costs nothing.
   *
   * `app/(site)/page.tsx` has already awaited it to decide which preset to
   * render, and it is a `'use cache'` function tagged `tags.settings('branding')`
   * — so this is a cache hit inside the same render, not a second round trip to
   * Nest. Taking it as a prop instead would have widened the contract the two
   * preset agents were both building against, for a value either of them can
   * read for itself.
   *
   * What it is for: the tenant's own uploaded logo, which is the only image on
   * this page that is allowed to be a picture of anybody.
   */
  const branding = await getBranding();

  /*
   * The display name, through the ONE gate.
   *
   * `copy.site.name` is the fallback ARGUMENT, never the value: `tenantName()`
   * hands it back only on the stack whose `TENANT_KEY` is `ayman` and returns
   * `TENANT_DISPLAY_NAME` — or the anonymous «المنصة» — everywhere else. It is
   * used for exactly two things below: the initial chalked on the mark's empty
   * slab, and the fallback `<h1>`. Both are places a wrong name would be a
   * stranger's name on somebody else's domain, which is the failure
   * `lib/tenant.ts` exists to make unspellable.
   */
  const name = tenantName(copy.site.name);

  /*
   * WHICH section carries the page's single `<h1>`.
   *
   * `home_blocks` is an ordered list a tenant composes, so nothing here can
   * assume the first thing on the page is a hero: an admin is free to delete
   * the hero block, or to put the FAQ above it. Hard-coding `<h1>` in the panel
   * leaves such a page with no `<h1>` at all — which axe reports, which costs
   * the page its heading in every search result, and which leaves anyone
   * navigating by headings with nothing to land on.
   *
   * So the first block that will DEFINITELY render a heading owns it and
   * everything after it is an `<h2>`. `ownsPageHeading` is deliberately
   * pessimistic — see its own note for the two types it refuses.
   */
  const headingOwner = blocks.find(ownsPageHeading)?.id ?? null;

  /*
   * `data-preset` is the ONLY hook on this element, and there is deliberately
   * no class alongside it. Every rule in the `BOARD` section of `presets.css`
   * is scoped under `[data-preset='board']`; a second handle would be a second
   * thing to keep in step and a second way for a selector to escape the scope.
   */
  return (
    <main data-preset="board">
      {/*
        The last resort, and it should never render.

        It takes a page composed entirely of blocks that cannot carry a heading
        — a lone `cta`, or a `stats` block with its title cleared — and gives it
        a real `<h1>` anyway rather than shipping a document with none. Visually
        hidden (`sr-only`), because on such a page there is no place to PUT a
        visible heading that would not be inventing a section the tenant did not
        compose.

        It is not a substitute for the check above: a hidden heading is a worse
        answer than a visible one for a sighted reader and for a search snippet
        alike, which is why it is gated on there being no visible candidate at
        all.
      */}
      {headingOwner === null ? <h1 className="sr-only">{name}</h1> : null}

      {blocks.map((block) => renderBoardBlock(block, honorBoard, branding, name, headingOwner))}
    </main>
  );
}

/**
 * Will this block certainly render a heading?
 *
 * Pessimistic on purpose — a `true` here that turns out to be wrong is a page
 * with no `<h1>`, which is the failure the whole mechanism exists to prevent.
 * Two types say `false` even though they usually would:
 *
 * · **`books`** — `<BoardBooks>` renders NOTHING when the shop is empty, when
 *   every title has been taken off the landing page, or when the API could not
 *   be reached. A page's `<h1>` must not be able to disappear because a book
 *   went out of stock.
 * · **`cta`** — it is the page's closing panel. A document whose only heading
 *   is its last line is a document a screen reader cannot navigate, and
 *   promoting a closer to `<h1>` would also put the page's strongest heading
 *   below every word of its content.
 *
 * `stats`, `testimonials` and `faq` carry an OPTIONAL title (`.default('')`),
 * so they qualify only when the admin actually wrote one. The three
 * placement-only types always qualify: their headings come from the shared
 * copy table, so they cannot be blank.
 *
 * ## ⚠️ `yearTracks` qualifies HERE and does not on «الترمينال»
 *
 * The two presets answer this question differently about the same block, and
 * that is a fact about the components rather than an oversight in one of the
 * predicates. `<BoardYears>` falls back to `FALLBACK_YEARS` and always draws
 * its `<BoardHeading>`, so an empty catalogue is an empty BODY under a heading
 * that is already on the page. `<NeonTracks>` returns `null` outright on an
 * empty catalogue — deliberately, so a new stack never shows two «لسه فاضي»
 * panels in a row — which is why `hasHeading` in `neon-landing.tsx` refuses
 * it, and why that preset could render a page with no `<h1>` at all until it
 * did.
 *
 * The rule both files follow: this may only say `true` about a section that
 * CANNOT stand down. `board-landing.test.tsx` renders every type trusted here
 * with empty data and asserts an `<h1>` actually comes out, so the claim is
 * checked rather than believed — asserting which section was handed `level={1}`
 * is not the same assertion and would have passed either way.
 */
function ownsPageHeading(block: HomeBlock): boolean {
  const { props } = block;

  switch (props.type) {
    case 'hero':
      return props.headlineAr.length > 0;
    case 'whyRail':
    case 'courseGrid':
    case 'about':
      return props.titleAr.length > 0;
    case 'instructor':
    case 'yearTracks':
    case 'honorBoard':
      return true;
    case 'stats':
    case 'testimonials':
    case 'faq':
      return props.titleAr.length > 0;
    case 'books':
    case 'cta':
      return false;
  }
}

function renderBoardBlock(
  block: HomeBlock,
  honorBoard: HonorBoardEntry[],
  branding: BrandingRead,
  name: string,
  headingOwner: string | null,
) {
  const { props } = block;
  /* `1` for exactly one block on the page. See `ownsPageHeading`. */
  const level: 1 | 2 = block.id === headingOwner ? 1 : 2;

  switch (props.type) {
    case 'hero':
      return (
        <BoardPanel
          key={block.id}
          branding={branding}
          name={name}
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
        <BoardFeatures
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
        <BoardCourses
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
        <BoardBooks
          key={block.id}
          title={props.titleAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          limit={props.limit}
          level={level}
        />
      );

    case 'instructor':
      return <BoardInstructor key={block.id} level={level} />;

    case 'yearTracks':
      return <BoardYears key={block.id} level={level} />;

    case 'honorBoard':
      return <BoardHonors key={block.id} entries={honorBoard} level={level} />;

    case 'about':
      return (
        <BoardAbout
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
      return <BoardStats key={block.id} title={props.titleAr} items={props.items} level={level} />;

    case 'testimonials':
      return <BoardQuotes key={block.id} title={props.titleAr} items={props.items} level={level} />;

    case 'faq':
      /*
       * The `JsonLd` sits INSIDE this case, exactly where `classic` puts its
       * own, and for the same two reasons: it is fed `props.items` — the rows
       * this block actually renders — and it cannot outlive the section, so
       * unpublishing the FAQ takes the markup describing it away instead of
       * leaving the page advertising answers it no longer shows.
       *
       * Emitting it here rather than skipping it is deliberate. A tenant who
       * switches preset must not silently lose their FAQ rich result; the
       * structured data describes the CONTENT, and the content is the same
       * rows either way.
       */
      return (
        <Fragment key={block.id}>
          <JsonLd data={faqPageJsonLd(props.items)} />
          <BoardFaq
            title={props.titleAr}
            eyebrow={props.eyebrowAr}
            rows={props.items}
            level={level}
          />
        </Fragment>
      );

    case 'cta':
      return (
        <BoardCta
          key={block.id}
          headline={props.headlineAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          ctaHref={props.ctaHref}
        />
      );
  }
}
