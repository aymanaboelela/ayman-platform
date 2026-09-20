/**
 * «اللوح» — the words this preset needs that no block carries.
 *
 * ## Why these are HERE and not in `packages/contracts/src/copy/ar.ts`
 *
 * Two reasons, and the second is the load-bearing one.
 *
 * 1. Every string below belongs to ONE page component. `ar.ts` is the copy
 *    table for the platform — the words that appear on more than one surface,
 *    or that an editor is expected to find. A label that exists only inside
 *    `board-years.tsx` is not platform copy; putting it in the shared table
 *    makes `copy.landing` a junk drawer with a section per preset, and every
 *    future preset would add another.
 *
 * 2. `ar.ts` is a 5,000-line file that three agents are editing in the same
 *    session. Appending a `board: { … }` object to it is a merge conflict with
 *    whoever else is appending theirs, on a file where a conflict resolved
 *    badly silently rewrites live copy. This module is mine alone.
 *
 * Anything that is genuinely shared is READ from `@ayman/contracts/copy`
 * instead of restated here — the year names (`copy.years.year1…3`), the lesson
 * and hour units (`copy.catalog`), the honour board's ranks and its «لسه مفيش
 * أسماء» line (`copy.landing.honorBoard`). A second spelling of «الصف الأول
 * بكالوريا» living in this file is exactly how the landing page and
 * `/years/1` end up disagreeing about what a year is called.
 *
 * ## ⚠️ NOTHING PERSONAL IS ALLOWED IN THIS FILE
 *
 * Not a name, not a qualification, not a tagline, not a school. Any tenant can
 * select this preset from /admin/settings, so a sentence written for one
 * instructor renders on every other instructor's domain as a claim they never
 * made. The instructor's identity reaches this page from exactly three places,
 * all of them per-deployment: the `home_blocks` rows they composed,
 * `tenantName()` (`lib/tenant.ts`), and their uploaded branding assets. See
 * `packages/contracts/src/tenant-identity-leak.spec.ts` for what happens when
 * that rule is broken by accident.
 *
 * Voice: Egyptian, spoken, aimed at a secondary student and at the parent
 * reading over their shoulder. Short sentences. No English words that have a
 * normal Arabic equivalent.
 */
export const boardCopy = {
  /** The year tiles — the first real choice a visitor makes on this page. */
  years: {
    chip: 'الصفوف',
    title: 'ابدأ من صفّك',
    lead: 'اختار سنتك وادخل على كورساتها على طول.',
    /** The mono eyebrow above the big numeral on each tile. */
    tileEyebrow: 'الصف',
    /** The pill at the foot of each tile. */
    tileCta: 'ادخل على الصف',
  },

  /** The course grid — including the state a brand-new platform is in. */
  courses: {
    chip: 'الكورسات',
    /**
     * The empty catalogue, and this is the FIRST screen a new instructor's
     * students will see. It is written to convert rather than to apologise:
     * an account made today is an account that is already inside when the
     * first lecture lands, and `/register` is a route that exists on every
     * deployment from the first boot.
     */
    emptyTitle: 'الكورسات لسه بتتجهّز',
    emptyBody:
      'المحاضرات بتتسجّل دلوقتي. اعمل حسابك النهارده، وأول ما ينزل كورس هتلاقيه مستنيك جوه من غير ما تدوّر.',
    emptyCta: 'اعمل حسابك',
    /**
     * The small line ABOVE the price on a card, so a number never stands on
     * its own — a card that says «250 ج / الشهر» and nothing else reads as the
     * price of the course, when it is the price of its cheapest plan.
     *
     * The price string itself is NOT here: it comes from
     * `copy.course.priceMonthly` / `priceQuarterly` / `priceYearly`, the same
     * three templates the course detail page and the classic card both use.
     * A second spelling of «{price} ج / الشهر» in this file would be a second
     * place the currency word and the period separator can drift, one click
     * apart from each other.
     *
     * «مجاني بالكامل» and «دخول الكورس» are likewise read from
     * `copy.landing.courseFree` / `courseOpen` rather than restated here.
     */
    priceFrom: 'يبدأ من',
  },

  /** The `instructor` block, rebuilt for this preset — see `board-instructor.tsx`. */
  instructor: {
    chip: 'المدرّس',
    /**
     * The heading when the admin placed an `instructor` block. Deliberately a
     * role and not a name: the name is the page's `<h1>` up in the panel, and
     * printing it twice on one page reads as a template that was not filled
     * in properly.
     */
    title: 'مين اللي هيشرحلك',
    /**
     * What the section says while the catalogue is still empty, in place of a
     * row of zeroes. «٠ كورس · ٠ محاضرة» is the single most discouraging thing
     * a first visitor could read, and it is also just noise — the counts below
     * are only worth printing once there is something to count.
     */
    starting: 'المنصة لسه في أولها — المحتوى بيتبني درس ورا درس، وكل حاجة بتنزل هتلاقيها هنا.',
    coursesUnit: 'كورس',
    lessonsUnit: 'محاضرة',
    hoursUnit: 'ساعة شرح',
  },

  /** «لوحة الشرف» on this preset. */
  honors: {
    chip: 'امتحان الشهر',
  },

  /** The `about` block. */
  about: {
    chip: 'عن المنصة',
  },

  /** The `whyRail` block, rebuilt as a card grid. */
  features: {
    chip: 'ليه إحنا',
  },

  /** The `testimonials` block. */
  quotes: {
    chip: 'آراء الطلبة',
  },

  /** The `faq` block. */
  faq: {
    chip: 'أسئلة متكررة',
  },

  /**
   * The footer — see `<BoardFooter>`.
   *
   * One word, and it is first-person plural on purpose: «يلا نبدأ» addresses
   * nobody's gender, where «ابدأ» would pick one. The rest of this footer's
   * words are the platform's own (`footer-content.ts`), shared with the other
   * two presets so three footers cannot disagree about what a column is called.
   */
  footer: {
    chip: 'يلا نبدأ',
  },

  /** The `books` block. */
  books: {
    chip: 'الكتب',
    buy: 'اطلب الكتاب',
  },
} as const;
