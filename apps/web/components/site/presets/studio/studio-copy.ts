/**
 * «الاستوديو» — the words this preset needs that no stored block carries.
 *
 * Same rule as `board-copy.ts`, for the same two reasons: these strings belong
 * to one page component, and `ar.ts` is a shared table that a per-preset
 * section turns into a junk drawer. Anything genuinely shared is read from
 * `@ayman/contracts/copy` instead of restated here.
 *
 * ## ⚠️ NOTHING PERSONAL IS ALLOWED IN THIS FILE
 *
 * Not a name, not a qualification, not a school, not a subject. Any tenant can
 * select this preset from /admin/settings, so a sentence written for one
 * instructor ships to every other one who picks it. Everything specific to a
 * person comes off their own `home_blocks` row.
 */
export const studioCopy = {
  /** Sits under the opener's headline when the block has no lead of its own. */
  heroLeadFallback: 'محاضرات مسجّلة بتتفتح في أي وقت، وتمارين بعد كل درس.',

  /**
   * The label above the code panel beside the photograph.
   *
   * It names what the reader is looking at rather than decorating it: without
   * it, a beginner sees a block of English symbols and reads «this is not for
   * me» — which is the exact opposite of what the opener is there to say.
   */
  heroCodeLabel: 'أول برنامج هتكتبه',

  /**
   * The code itself.
   *
   * ⚠️ IT IS REAL, IT RUNS, AND THE COMMENT IS IN ARABIC ON PURPOSE. A panel
   * of plausible-looking nonsense is decoration pretending to be content, and
   * a reader who knows any Python spots it instantly. Three lines is the whole
   * budget: enough to show a variable, a call and a result, short enough that
   * someone who has never programmed can read every character of it.
   */
  heroCode: [
    { comment: '# اكتب اسمك بين القوسين', code: null },
    { comment: null, code: 'name = "محمد"' },
    { comment: null, code: 'print("أهلاً يا", name)' },
  ],
  /** What that code prints, shown under it so the loop is closed on screen. */
  heroCodeOut: 'أهلاً يا محمد',

  /** The opener's scroll cue, which is also the anchor's accessible name. */
  heroMore: 'شوف الكورسات',

  /** Section chips. Each names its section and never carries a unique fact. */
  chipCourses: 'الكورسات',
  chipWhy: 'ليه هنا',
  chipYears: 'الصفوف',
  yearsTitle: 'ابدأ من صفّك',
  yearsLead: 'اختار سنتك وادخل على كورساتها على طول.',
  chipBooks: 'الكتب',
  chipFaq: 'أسئلة',
  chipHonors: 'لوحة الشرف',
  chipQuotes: 'آراء',

  /** Shown in place of a section whose data has not arrived yet. */
  empty: 'لسه فاضي.',
} as const;
