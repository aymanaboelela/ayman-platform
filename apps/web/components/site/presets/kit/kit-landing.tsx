import { Fragment } from 'react';
import { copy } from '@ayman/contracts/copy';
import type { HomeBlock, HomeBlockList } from '@ayman/contracts/admin/home-blocks';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import type { BrandingRead } from '@ayman/contracts/admin/settings';
import { JsonLd } from '@/components/seo/json-ld';
import { faqPageJsonLd } from '@/lib/seo/jsonld';
import { getBranding } from '@/lib/settings';
import { tenantName } from '@/lib/tenant';
import { KIT_FONT } from './kit-font';
import {
  KitAbout,
  KitBooks,
  KitCourses,
  KitCta,
  KitFaq,
  KitGrades,
  KitHero,
  KitHonors,
  KitInstructor,
  KitQuotes,
  KitStats,
  KitWhy,
} from './kit-sections';
import type { KitPreset } from './kit-preset';

/**
 * The page for `ruqaa`, `kurrasa` and `taif`: the tenant's blocks, in order,
 * through one kit of sections. All twelve block types render — a block the
 * admin can compose must never vanish because a preset was not designed for
 * it — and exactly one section owns the page's `<h1>`, the first that can
 * carry one, the same rule `<BoardLanding>` follows.
 */
export async function KitLanding({
  preset,
  blocks,
  honorBoard,
}: {
  preset: KitPreset;
  blocks: HomeBlockList;
  honorBoard: HonorBoardEntry[];
}) {
  const branding = await getBranding();
  const name = tenantName(copy.site.name);
  const headingOwner = blocks.find(ownsPageHeading)?.id ?? null;

  return (
    <main data-preset={preset} className={KIT_FONT[preset]}>
      {headingOwner === null ? <h1 className="sr-only">{name}</h1> : null}
      {blocks.map((block) => renderKitBlock(preset, block, honorBoard, branding, name, headingOwner))}
    </main>
  );
}

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

function renderKitBlock(
  preset: KitPreset,
  block: HomeBlock,
  honorBoard: HonorBoardEntry[],
  branding: BrandingRead,
  name: string,
  headingOwner: string | null,
) {
  const { props } = block;
  const level: 1 | 2 = block.id === headingOwner ? 1 : 2;

  switch (props.type) {
    case 'hero':
      return (
        <KitHero
          key={block.id}
          preset={preset}
          branding={branding}
          name={name}
          eyebrow={props.eyebrowAr}
          headline={props.headlineAr}
          role={props.subheadlineAr || props.rotatingAr[0] || ''}
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
        <KitWhy
          key={block.id}
          preset={preset}
          title={props.titleAr}
          titleAccent={props.titleAccentAr}
          lead={props.leadAr}
          items={props.items}
          level={level}
        />
      );
    case 'courseGrid':
      return (
        <KitCourses
          key={block.id}
          preset={preset}
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
        <KitBooks
          key={block.id}
          preset={preset}
          title={props.titleAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          limit={props.limit}
          level={level}
        />
      );
    case 'instructor':
      return <KitInstructor key={block.id} preset={preset} level={level} />;
    case 'yearTracks':
      return <KitGrades key={block.id} preset={preset} level={level} />;
    case 'honorBoard':
      return <KitHonors key={block.id} preset={preset} entries={honorBoard} level={level} />;
    case 'about':
      return (
        <KitAbout
          key={block.id}
          preset={preset}
          title={props.titleAr}
          body1={props.body1Ar}
          body2={props.body2Ar}
          role={props.roleAr}
          chips={props.chipsAr}
          imageKey={block.imageKey}
          level={level}
        />
      );
    case 'stats':
      return <KitStats key={block.id} preset={preset} title={props.titleAr} items={props.items} level={level} />;
    case 'testimonials':
      return <KitQuotes key={block.id} preset={preset} title={props.titleAr} items={props.items} level={level} />;
    case 'faq':
      return (
        <Fragment key={block.id}>
          <JsonLd data={faqPageJsonLd(props.items)} />
          <KitFaq preset={preset} title={props.titleAr} eyebrow={props.eyebrowAr} rows={props.items} level={level} />
        </Fragment>
      );
    case 'cta':
      return (
        <KitCta
          key={block.id}
          headline={props.headlineAr}
          lead={props.leadAr}
          ctaLabel={props.ctaLabelAr}
          ctaHref={props.ctaHref}
        />
      );
  }
}
