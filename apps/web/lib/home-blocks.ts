import { HonorBoardSchema, type HonorBoard, type HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { cacheLife, cacheTag } from 'next/cache';
import {
  HomeBlockListSchema,
  type HomeBlockList,
  type HomeBlockProps,
} from '@ayman/contracts/admin/home-blocks';
import type { Entitlements, FeatureKey } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy';
import { apiGet } from '@/lib/api';
import { getEntitlements } from '@/lib/entitlements';
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
    /**
     * «لوحة الشرف». Placement-only, like `instructor` and `yearTracks` — the
     * section builds itself and this entry only says where it sits.
     *
     * ⚠️ Its presence here is LOAD-BEARING for a fresh database, and it is the
     * other half of the guard in `20260909030000_seed_honor_board_block`. This
     * list is served only while `home_blocks` is EMPTY (see the return at the
     * bottom of this file); that migration deliberately does nothing to an
     * empty table, so this entry is what puts the section on the page there.
     * On a seeded table the migration's own row does it instead. Removing
     * either one silently drops the section from one of the two worlds.
     */
    key: 'honor-board',
    props: { type: 'honorBoard' },
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

/**
 * The same page for a deployment that is NOT Ayman's.
 *
 * `DEFAULT_HOME_BLOCKS` above is his real, designed landing page, and it is
 * served in two situations: an empty `home_blocks` table, and an API that
 * cannot be reached. Both are correct for him — an outage should still show
 * his homepage. Neither is correct for anybody else. A second instructor's
 * first boot has an empty table by definition, so his hero copy, his «why»
 * rail, his biography and his ten FAQs would render, finished and convincing,
 * on somebody else's domain. And once that tenant is live, one API blip would
 * do the same thing from inside their own container.
 *
 * So the fallback is chosen by `TENANT_KEY`, the same switch the API's
 * `TENANT_CONTACT_SEED` uses. This list is deliberately SHORT and says nothing
 * that is not true of every deployment:
 *
 * · `hero` — the tenant's own display name, a generic promise, two CTAs.
 * · `courseGrid` — reads the catalogue, so it shows THEIR courses or nothing.
 * · `yearTracks` — builds itself from the shared curriculum taxonomy, which is
 *   identical for every tenant, so it is true on day one with zero content.
 *
 * Nothing biographical, no `about`, no `honorBoard` (there are no results to
 * put on a board of honour on day one, and reserved empty places on a brand
 * new site read as a broken section rather than a promise), and no `faq` —
 * ten answers about somebody else's courses are worse than no FAQ.
 *
 * This is a FALLBACK, not the product. The tenant composes their real page in
 * /admin/home and from that moment this is only ever seen during an outage.
 */
const TENANT_KEY = (process.env.TENANT_KEY ?? '').trim() || 'ayman';

/**
 * The instructor's name as it should appear before anybody has opened
 * /admin/settings. Set per stack by the provisioner. The generic phrase is the
 * honest last resort — it names no one rather than naming the wrong person.
 */
const TENANT_DISPLAY_NAME = (process.env.TENANT_DISPLAY_NAME ?? '').trim() || 'المنصة التعليمية';

const NEUTRAL_FALLBACK_BLOCKS: readonly { key: string; props: HomeBlockProps }[] = [
  {
    key: 'hero',
    props: {
      type: 'hero',
      eyebrowAr: 'منصة تعليمية',
      headlineAr: TENANT_DISPLAY_NAME,
      subheadlineAr: 'كل الشرح والامتحانات في مكان واحد',
      rotatingAr: [],
      leadAr: 'محاضرات مسجّلة تتفرج عليها في وقتك، وامتحانات تقيس مستواك أول بأول.',
      ctaLabelAr: 'ابدأ دلوقتي',
      ctaHref: '/register',
      secondaryCtaLabelAr: 'شوف الكورسات',
      secondaryCtaHref: '/courses',
      stats: [],
      imageAssetId: null,
    },
  },
  {
    key: 'featured-courses',
    props: {
      type: 'courseGrid',
      titleAr: 'الكورسات',
      leadAr: 'اللي متاح دلوقتي.',
      ctaLabelAr: 'كل الكورسات',
      courseIds: [],
      limit: 3,
    },
  },
  { key: 'year-tracks', props: { type: 'yearTracks' } },
];

/** Shaped like the API's response so the renderer has one path. */
function asBlockList(
  blocks: readonly { key: string; props: HomeBlockProps }[],
): HomeBlockList {
  return blocks.map((block, index) => ({
    id: `default-${block.key}`,
    key: block.key,
    position: index,
    isPublished: true,
    props: block.props,
  }));
}

/**
 * This deployment's starter page — what the fallback renders, and what
 * «انشر الصفحة الافتراضية» in /admin/home writes into `home_blocks`.
 *
 * One constant for both, deliberately. The admin action's whole promise is
 * "turn what visitors already see into rows you can edit"; if it seeded a
 * different list from the one being rendered, pressing it would silently
 * change the live page. On a non-Ayman stack that divergence was the bug —
 * the action would have written HIS page into THEIR database, permanently,
 * where no fallback gate could take it back.
 */
export const STARTER_HOME_BLOCKS: readonly { key: string; props: HomeBlockProps }[] =
  TENANT_KEY === 'ayman' ? DEFAULT_HOME_BLOCKS : NEUTRAL_FALLBACK_BLOCKS;

const FALLBACK: HomeBlockList = asBlockList(STARTER_HOME_BLOCKS);

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
/**
 * أنواع البلوكات اللي بتعيش جوّه فيتشر. اللي مش هنا مالوش علاقة بحاجة
 * بتتفتح وتتقفل — الهيرو والكورسات والأسئلة هم المنصة نفسها.
 */
const BLOCK_FEATURE: Partial<Record<HomeBlockProps['type'], FeatureKey>> = {
  books: 'books',
  honorBoard: 'honorBoard',
};

/**
 * بيشيل بلوكات الفيتشرز المقفولة من الليستة قبل ما ترجع.
 *
 * ⚠️ بيتنده على **المخرج**، بعد الـ`try` وبعد الـfallback — مش جوّاه. أول
 * boot لأي ستاك جديد جدوله `home_blocks` فاضي، يعني الصفحة اللي بتترسم هي
 * `FALLBACK` المحسوبة على مستوى المودیول؛ فلتر جوّه الـ`try` بس كان
 * هيسيب بلوك الكتب ولوحة الشرف يترسموا بالظبط على الستاك اللي لسه ما
 * اتفتحلوش حاجة.
 *
 * وبيشيل البلوك كله بدل ما يسيبه يرسم فاضي: `<HonorBoardSection>` بترسم
 * «أماكن محجوزة» لما مايبقاش فيه أسامي، وده على ستاك مالوش لوحة شرف بيبقى
 * قسم بيوعد بحاجة عمرها ما هتيجي.
 */
function withoutClosedBlocks(blocks: HomeBlockList, features: Entitlements): HomeBlockList {
  return blocks.filter((block) => {
    const feature = BLOCK_FEATURE[block.props.type];
    return feature === undefined || features[feature];
  });
}

export async function getHomeBlocks(): Promise<HomeBlockList> {
  'use cache';
  cacheLife('minutes');
  cacheTag(tags.homeBlocks());

  const features = await getEntitlements();

  try {
    const blocks = await apiGet('/api/home-blocks', HomeBlockListSchema);
    return withoutClosedBlocks(blocks.length > 0 ? blocks : FALLBACK, features);
  } catch {
    return withoutClosedBlocks(FALLBACK, features);
  }
}

/**
 * لوحة الشرف — the names on the public board.
 *
 * Cached like every other landing read, and it fails SOFT to an empty board:
 * `<HonorBoardSection>` renders its reserved places when there is nothing on
 * it, so an API blip costs the page a board with no names rather than a
 * section that 500s. The empty render is the one this component was written
 * for in the first place.
 */
export async function getHonorBoard(): Promise<HonorBoardEntry[]> {
  return (await getHonorBoardRounds()).entries;
}

/**
 * The same read, un-narrowed — the archive page needs every round, and the
 * landing page needs only the newest.
 *
 * ONE cached function behind both, rather than two reads of the same route:
 * they share a cache tag, and two entries under one tag is a pair that can
 * disagree about what the board says for as long as `minutes` lasts.
 *
 * Fails SOFT for the reason above, and the archive renders its own empty
 * state from `periods: []`.
 */
export async function getHonorBoardRounds(): Promise<HonorBoard> {
  'use cache';
  cacheLife('minutes');
  cacheTag(tags.honorBoard());

  /* الراوت نفسه بيرد ٤٠٤ على ستاك اللوحة مقفولة فيه، فالـ`catch` تحت كان
     هيكفي. السطر ده موجود عشان ما نبعتش نداء إحنا عارفين إنه هيقع — والفرق
     مش تجميلي: النداء ده جوّه كاش بيكاش فشله كمان، فالستاك ده كان هيدفع
     محاولة كل بضع دقايق للأبد. */
  if (!(await getEntitlements()).honorBoard) return { entries: [], periods: [] };

  try {
    return await apiGet('/api/catalog/honor-board', HonorBoardSchema);
  } catch {
    return { entries: [], periods: [] };
  }
}

