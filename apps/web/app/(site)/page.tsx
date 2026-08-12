import { Fragment } from 'react';
import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import type { HomeBlock } from '@ayman/contracts/admin/home-blocks';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata } from '@/lib/seo/metadata';
import { faqPageJsonLd } from '@/lib/seo/jsonld';
import { getHomeBlocks } from '@/lib/home-blocks';
import { SiteHero } from '@/components/site/site-hero';
import { WhyRail } from '@/components/site/why-rail';
import { FeaturedCourses } from '@/components/site/featured-courses';
import { InstructorProfile } from '@/components/site/instructor-profile';
import { YearTracks } from '@/components/site/year-tracks';
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
 * · **`instructor` and `yearTracks`.** Those build themselves from the
 *   catalogue and the taxonomy, so their blocks carry no props at all — the
 *   admin decides where they sit and whether they run, nothing else. See
 *   `packages/contracts/src/admin/home-blocks.ts`.
 *
 * `getHomeBlocks()` never throws and never returns an empty list: an empty
 * table or an unreachable API both fall back to `DEFAULT_HOME_BLOCKS`, the
 * shipped page. This route therefore has no failure mode where it renders
 * nothing.
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

export default async function HomePage() {
  const blocks = await getHomeBlocks();

  return <main>{blocks.map((block) => renderBlock(block))}</main>;
}

function renderBlock(block: HomeBlock) {
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

    case 'instructor':
      return <InstructorProfile key={block.id} />;

    case 'yearTracks':
      return <YearTracks key={block.id} />;

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
