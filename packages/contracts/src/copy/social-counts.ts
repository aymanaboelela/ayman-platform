import type { ArabicCountForms } from '@ayman/contracts/arabic-count';

/**
 * «عدد السوشيال ميديا» — the follower counts on the landing page, and the
 * admin card that types them in.
 *
 * Egyptian Arabic. Nothing here addresses the student at all — a count is a
 * fact about the account — and no instructor's name or handle appears: the
 * links come from the stack's own `contact` settings.
 */
export const socialCountsCopy = {
  /** The list's accessible name on the landing page. */
  listLabel: 'المتابعين على السوشيال ميديا',

  /**
   * One line per network under the figure. YouTube says «مشترك» because that
   * is what YouTube itself calls them; the other three say «متابع».
   */
  networks: {
    youtube: { name: 'يوتيوب', label: 'مشترك على يوتيوب', unit: 'مشترك', visit: 'زيارة القناة' },
    facebook: { name: 'فيسبوك', label: 'متابع على فيسبوك', unit: 'متابع', visit: 'زيارة الصفحة' },
    instagram: { name: 'إنستجرام', label: 'متابع على إنستجرام', unit: 'متابع', visit: 'زيارة الحساب' },
    tiktok: { name: 'تيك توك', label: 'متابع على تيك توك', unit: 'متابع', visit: 'زيارة الحساب' },
  },

  /**
   * The band under the landing hero (`<SocialProofBand>`).
   *
   * `visit` above is a verbal noun on purpose: «اشترك» / «تابع» are the
   * imperatives every platform uses and both are masculine-only (CLAUDE.md
   * §7) — «زيارة القناة» says where the link goes without addressing anyone.
   */
  band: {
    /**
     * Under the combined figure. The figure only shows with two or more
     * networks: with one, it would repeat that network's card beside it.
     */
    totalLabel: 'متابع على السوشيال ميديا',
    /** Appended to each link's accessible name: it leaves the site. */
    newTab: '(بيفتح في صفحة جديدة)',
  },

  /** `{n}` — a figure that was rounded DOWN, so the real number is higher. */
  approx: '+{n}',

  /** How a whole number of thousands is said: «ألف»، «ألفين»، «٥ آلاف»، «١٢٠ ألف». */
  thousand: { one: 'ألف', two: 'ألفين', few: '{count} آلاف', many: '{count} ألف' } satisfies ArabicCountForms,
  million: { one: 'مليون', two: 'مليونين', few: '{count} ملايين', many: '{count} مليون' } satisfies ArabicCountForms,
  /** A fraction takes the singular: «1.5 ألف»، «2.3 مليون». */
  thousandFraction: '{count} ألف',
  millionFraction: '{count} مليون',

  admin: {
    title: 'عدد السوشيال ميديا',
    nav: 'السوشيال ميديا',
    note: 'اكتب عدد المتابعين زي ما هو على كل حساب. اللي يتساب فاضي مش بيظهر، ولو كلهم فاضيين الأرقام مش بتظهر في الصفحة الرئيسية خالص.',
    /** `{preview}` — how the number will read on the landing page. */
    preview: 'هيظهر كده: {preview}',
    noLink: 'مفيش لينك للحساب ده في «التواصل»، فالرقم هيظهر من غير لينك.',
    /** `{date}` — when the counts were last saved. */
    lastUpdated: 'آخر تحديث: {date}',
    neverUpdated: 'لسه ما اتكتبش أي رقم.',
    /**
     * Under a field while the API keeps it (`isAutoSynced`); the field is
     * read-only then. `{network}` — `networks.<n>.name` («يوتيوب»، «فيسبوك»،
     * «إنستجرام»); `{date}` — that network's last successful sync.
     */
    autoSynced: 'بيتحدّث تلقائياً من {network} · آخر مزامنة: {date}',
  },
} as const;
