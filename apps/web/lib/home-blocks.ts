import { cacheLife, cacheTag } from 'next/cache';
import {
  HomeBlockListSchema,
  type HomeBlockList,
  type HomeBlockProps,
} from '@ayman/contracts/admin/home-blocks';
import { copy } from '@ayman/contracts/copy';
import { apiGet } from '@/lib/api';
import { tags } from '@/lib/cache-tags';

const c = copy.landing;

/**
 * The landing page as it ships with no rows in `home_blocks` — a fresh
 * install, and the state the page falls back to if the API is unreachable.
 *
 * This is NOT a placeholder. It is the real, designed page, expressed in the
 * same shape the composer edits, which is what makes "the admin controls the
 * homepage" true without also making "the homepage is empty until an admin
 * fills it in" true. `pnpm --filter @ayman/api db:seed` writes exactly these
 * rows, so an admin's first visit to /admin/home shows the live page rather
 * than a blank composer.
 *
 * Order here is the on-page order.
 */
export const DEFAULT_HOME_BLOCKS: readonly { key: string; props: HomeBlockProps }[] = [
  {
    key: 'hero',
    props: {
      type: 'hero',
      eyebrowAr: c.heroEyebrow,
      headlineAr: c.heroLine1,
      subheadlineAr: c.heroLine2,
      rotatingAr: [...c.heroRotating],
      leadAr: c.heroLead,
      ctaLabelAr: c.ctaPrimary,
      ctaHref: '/register',
      secondaryCtaLabelAr: c.ctaSecondary,
      secondaryCtaHref: '/courses',
      // ⚠️ EMPTY ON PURPOSE. The row of four figures under the CTAs — students,
      // rating, hours, projects — was taken off the hero by the brand owner.
      // `<SiteHero>` renders nothing when this is empty (it does NOT fall back
      // to its own defaults for an empty array, only for an absent prop), and
      // the four copy strings stay in `ar.ts`, so putting them back is filling
      // this in or adding them from /admin/home. Do not "restore" them here.
      stats: [],
      imageAssetId: null,
    },
  },
  {
    key: 'why-rail',
    props: {
      type: 'whyRail',
      titleAr: c.whyTitle,
      titleAccentAr: c.whyTitleAccent,
      leadAr: c.whyLead,
      leadSecondaryAr: c.whyLeadSecondary,
      items: [
        { titleAr: c.why1Title, bodyAr: c.why1Body },
        { titleAr: c.why2Title, bodyAr: c.why2Body },
        { titleAr: c.why3Title, bodyAr: c.why3Body },
        { titleAr: c.why4Title, bodyAr: c.why4Body },
        { titleAr: c.why5Title, bodyAr: c.why5Body },
        { titleAr: c.why6Title, bodyAr: c.why6Body },
        { titleAr: c.why7Title, bodyAr: c.why7Body },
        { titleAr: c.why8Title, bodyAr: c.why8Body },
      ],
    },
  },
  {
    key: 'featured-courses',
    props: {
      type: 'courseGrid',
      titleAr: c.coursesTitle,
      leadAr: c.coursesLead,
      ctaLabelAr: c.coursesCta,
      courseIds: [],
      limit: 3,
    },
  },
  {
    /*
     * Straight after the course grid, and that placement is the argument: a
     * reader who has just been shown what the recorded lessons are is the
     * reader for whom «والكتاب مطبوع كمان» means something. Above the year
     * tracks, because those are a navigation aid and this is a product.
     */
    key: 'books-strip',
    props: {
      type: 'books',
      titleAr: c.booksTitle,
      leadAr: c.booksLead,
      ctaLabelAr: c.booksCta,
      limit: 3,
    },
  },
  // ⚠️ NO `instructor` BLOCK, and its absence is a decision rather than an
  // omission. The profile — avatar, tier, counts, course grid — was taken off
  // the shipped page by the brand owner; `<InstructorProfile>` and the
  // `instructor` block type both stay registered, so an admin can put it back
  // from /admin/home without any code change. Do not "restore" it here.
  { key: 'year-tracks', props: { type: 'yearTracks' } },
  {
    key: 'about-instructor',
    props: {
      type: 'about',
      titleAr: c.aboutTitle,
      body1Ar: c.aboutBody1,
      body2Ar: c.aboutBody2,
      roleAr: c.aboutRole,
      chipsAr: [c.aboutChip1, c.aboutChip2, c.aboutChip3],
    },
  },
  {
    key: 'faq',
    props: {
      type: 'faq',
      eyebrowAr: c.faqEyebrow,
      titleAr: c.faqTitle,
      /*
       * Order is the visitor's, not the crawler's: the rows a student on the
       * page is actually deciding between come first, and `faq8`–`faq10` — the
       * three written for how the question arrives from a search box — sit
       * after them rather than on top. `faqPageJsonLd` publishes all ten
       * either way, and `mainEntity` order carries no ranking weight.
       */
      items: [
        { questionAr: c.faq1Q, answerAr: c.faq1A },
        { questionAr: c.faq2Q, answerAr: c.faq2A },
        { questionAr: c.faq3Q, answerAr: c.faq3A },
        { questionAr: c.faq6Q, answerAr: c.faq6A },
        { questionAr: c.faq7Q, answerAr: c.faq7A },
        { questionAr: c.faq8Q, answerAr: c.faq8A },
        { questionAr: c.faq9Q, answerAr: c.faq9A },
        { questionAr: c.faq10Q, answerAr: c.faq10A },
        { questionAr: c.faq4Q, answerAr: c.faq4A },
        { questionAr: c.faq5Q, answerAr: c.faq5A },
      ],
    },
  },
] as const;

/** The fallback, shaped like the API's response so the renderer has one path. */
const FALLBACK: HomeBlockList = DEFAULT_HOME_BLOCKS.map((block, index) => ({
  id: `default-${block.key}`,
  key: block.key,
  position: index,
  isPublished: true,
  props: block.props,
}));

/**
 * The published section list for `/`.
 *
 * ⚠️ With `cacheComponents: true`, `fetch` is NOT cached by default and blocks
 * rendering — this has to be a `'use cache'` function or the landing page waits
 * on Nest on every request.
 *
 * The `try` has to be INSIDE the `'use cache'` body. An error thrown while a
 * cached function is executing surfaces to the caller as an opaque digest from
 * the `Cache` environment, which React re-throws during render; a `try/catch`
 * at the call site never sees it and the whole route 500s. Catching here is
 * what actually contains the failure — and the landing page is the one page
 * that has to keep working while the API is restarting.
 *
 * An empty table falls back too, deliberately: "no rows" on a fresh install
 * means "nobody has composed a homepage yet", not "the homepage is blank".
 * `cacheLife('minutes')` rather than `'hours'` because this caches its own
 * failures — a transient API restart must not pin the fallback for an
 * afternoon. Writes call `updateTag(tags.homeBlocks())` and land immediately
 * regardless.
 */
export async function getHomeBlocks(): Promise<HomeBlockList> {
  'use cache';
  cacheLife('minutes');
  cacheTag(tags.homeBlocks());

  try {
    const blocks = await apiGet('/api/home-blocks', HomeBlockListSchema);
    return blocks.length > 0 ? blocks : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
