import type { HomeBlock, HomeBlockList } from '@ayman/contracts/admin/home-blocks';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import type { BrandingRead } from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts/copy';

import { getBranding } from '@/lib/settings';
import { tenantName } from '@/lib/tenant';

import { StudioHero } from './studio-hero';
import { StudioAbout } from './studio-about';
import { StudioWhy } from './studio-why';
import { StudioCourses } from './studio-courses';
import { StudioTracks } from './studio-tracks';
import { StudioFaq } from './studio-faq';
import { StudioCta } from './studio-cta';
import { StudioStats, StudioQuotes, StudioHonors, StudioBooksLink } from './studio-simple';

/**
 * «الاستوديو» — the landing page for `branding.landingPreset === 'studio'`.
 *
 * ## What it is
 *
 * A light page built around one photograph. The opener gives the instructor's
 * own portrait a full column at the height of the viewport and sets the
 * promise beside it, with three lines of runnable code underneath that prove
 * the promise instead of restating it. Everything after that is quiet: prose
 * at a readable measure, sections separated by air and a hairline, and exactly
 * one dark band — the closing panel where somebody makes an account.
 *
 * ## Why it is not «الترمينال» recoloured
 *
 * `neon` dresses every section as a shell: `$`, a caret, `about.md`, a mono
 * label over each heading. That is a professional developer's aesthetic, and
 * it is pointed at fifteen-year-olds being told programming is easier than
 * they think — the chrome says «you are not in this world yet» to exactly the
 * reader who needs the opposite. This preset keeps the one place that
 * vocabulary earns its keep (real code, in the opener, with an Arabic comment)
 * and drops it everywhere else.
 *
 * It is also the only light landing preset. `classic` opens on a dark stage
 * and `board` is a solid colour field, so three instructors in one market had
 * three low-light pages.
 *
 * ## `data-preset` is the only hook
 *
 * Every rule in the `STUDIO` section of `app/(site)/styles/presets.css` is
 * scoped under `[data-preset='studio']`. No class alongside it: a second
 * handle is a second thing to keep in step and a second way for a selector to
 * escape the scope.
 */
export default async function StudioLanding({
  blocks,
  honorBoard,
}: {
  blocks: HomeBlockList;
  honorBoard: HonorBoardEntry[];
}) {
  /*
   * A cache hit, not a second round trip: `app/(site)/page.tsx` has already
   * awaited this to decide which preset to render, and it is a `'use cache'`
   * function tagged `tags.settings('branding')`.
   *
   * What it is for here: `portraitKey`, which is the whole opener.
   */
  const branding = await getBranding();

  /*
   * The display name, through the ONE gate. `copy.site.name` is the fallback
   * ARGUMENT and never the value — `tenantName()` returns it only on the stack
   * whose `TENANT_KEY` is `ayman`, and `TENANT_DISPLAY_NAME` or «المنصة»
   * everywhere else. It is used for one thing: the last-resort hidden heading
   * below, which is a place a wrong name would be a stranger's name on
   * somebody else's domain.
   */
  const name = tenantName(copy.site.name);

  const headingOwner = blocks.find(ownsPageHeading)?.id ?? null;

  return (
    <main data-preset="studio">
      {/*
        The last resort, and it should never render: a page composed only of
        blocks that cannot carry a heading still gets a real `<h1>` rather than
        shipping a document with none. Visually hidden because on such a page
        there is nowhere to PUT a visible one without inventing a section the
        tenant did not compose.
      */}
      {headingOwner === null ? <h1 className="sr-only">{name}</h1> : null}

      {blocks.map((block) => renderStudioBlock(block, honorBoard, branding, headingOwner))}
    </main>
  );
}

/**
 * Will this block certainly render a heading?
 *
 * Pessimistic on purpose: a `true` that turns out wrong is a page with no
 * `<h1>`, which is the failure the mechanism exists to prevent.
 *
 * ⚠️ `yearTracks` qualifies here and does NOT on «الترمينال», and that is a
 * fact about the components rather than a disagreement. `<StudioTracks>` draws
 * its heading and its three year panels whatever the catalogue holds;
 * `<NeonTracks>` returns `null` outright on an empty one. The rule both files
 * follow: this may only say `true` about a section that CANNOT stand down —
 * which is why the four list types in `studio-simple.tsx`, every one of which
 * returns `null` when empty, are all refused.
 */
function ownsPageHeading(block: HomeBlock): boolean {
  const { props } = block;

  switch (props.type) {
    case 'hero':
      return props.headlineAr.length > 0;
    case 'about':
      return props.titleAr.length > 0;
    case 'whyRail':
      return props.titleAr.length > 0;
    case 'courseGrid':
      return props.titleAr.length > 0;
    case 'faq':
      return props.titleAr.length > 0;
    case 'yearTracks':
      return true;
    /*
     * `books` renders a heading unconditionally on this preset — but it is
     * refused anyway, because `cta` is the page's closing panel and `books`
     * sits wherever an admin dragged it. A document whose only heading is
     * below every word of its content is one a reader cannot navigate.
     */
    default:
      return false;
  }
}

function renderStudioBlock(
  block: HomeBlock,
  honorBoard: HonorBoardEntry[],
  branding: BrandingRead,
  headingOwner: string | null,
) {
  const { props } = block;
  const level: 1 | 2 = block.id === headingOwner ? 1 : 2;

  switch (props.type) {
    case 'hero':
      return (
        <StudioHero
          key={block.id}
          eyebrow={props.eyebrowAr}
          headline={props.headlineAr}
          subheadline={props.subheadlineAr || props.rotatingAr[0] || ''}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          ctaHref={props.ctaHref}
          secondaryCtaLabel={props.secondaryCtaLabelAr}
          secondaryCtaHref={props.secondaryCtaHref}
          stats={props.stats}
          portraitKey={branding.portraitKey}
          level={level}
        />
      );

    case 'about':
      return (
        <StudioAbout
          key={block.id}
          title={props.titleAr}
          body1={props.body1Ar}
          body2={props.body2Ar}
          role={props.roleAr}
          chips={props.chipsAr}
          imageKey={block.imageKey}
          blockKey={block.key}
          level={level}
        />
      );

    case 'whyRail':
      return (
        <StudioWhy
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
        <StudioCourses
          key={block.id}
          title={props.titleAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          limit={props.limit}
          courseIds={props.courseIds}
          level={level}
        />
      );

    case 'yearTracks':
      return <StudioTracks key={block.id} level={level} />;

    case 'faq':
      return (
        <StudioFaq
          key={block.id}
          eyebrow={props.eyebrowAr}
          title={props.titleAr}
          items={props.items}
          level={level}
        />
      );

    case 'cta':
      return (
        <StudioCta
          key={block.id}
          headline={props.headlineAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          ctaHref={props.ctaHref}
          level={level}
        />
      );

    case 'stats':
      return (
        <StudioStats key={block.id} title={props.titleAr} items={props.items} level={level} />
      );

    case 'testimonials':
      return (
        <StudioQuotes key={block.id} title={props.titleAr} items={props.items} level={level} />
      );

    case 'honorBoard':
      return <StudioHonors key={block.id} entries={honorBoard} level={level} />;

    case 'books':
      return (
        <StudioBooksLink
          key={block.id}
          title={props.titleAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          level={level}
        />
      );

    /*
     * `instructor` draws nothing here, and that is a decision.
     *
     * The block exists to print a profile — avatar, tier, counts — and this
     * preset has already given the instructor's photograph the largest object
     * on the page and an `about` section to say who they are. A third
     * appearance of the same person between the two is the page repeating
     * itself. The type stays registered so an admin can move the block without
     * it vanishing from the composer.
     */
    case 'instructor':
      return null;

    default:
      return null;
  }
}
