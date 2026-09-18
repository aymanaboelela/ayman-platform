/**
 * «الترمينال»'s own words — and the reason they are HERE rather than in
 * `packages/contracts/src/copy/ar.ts` with everything else.
 *
 * ## Why a local copy table
 *
 * Two of them, actually, and the second is the one that decides it.
 *
 * 1. **Nothing in this file is about a tenant.** `copy.landing` is Ayman's
 *    landing page written out in full — his hero lines, his eight «ليه»
 *    reasons, his ten FAQ answers — and every one of those is CONTENT, which
 *    on this preset arrives from `home_blocks` instead. What is left for the
 *    preset to own is CHROME: the `// courses` markers, the bracketed command
 *    labels, the empty states, the three steps. Those belong to the look, not
 *    to the instructor, and they change when the look changes.
 *
 * 2. **`copy/ar.ts` is 5,000 lines that several agents are editing at once.**
 *    Two presets were being built in parallel against the same branch; a
 *    shared copy table is a guaranteed conflict in a file where a bad merge is
 *    not a compile error, it is a sentence that says the wrong thing. A module
 *    that only this directory imports cannot collide with anything.
 *
 * The rule this file inherits unchanged: Arabic as an Egyptian secondary
 * student and their parent actually speak it, never Modern Standard, and never
 * gendered — the platform does not know whether it is talking to a boy or a
 * girl and must not guess.
 *
 * ## The Latin strings are markers, not labels
 *
 * `MARKERS` and `META` are code, deliberately: they are the section comments
 * and the aligned meta keys that make the page read as a terminal. They are
 * NOT translations of the Arabic beside them and a screen reader is not asked
 * to read them as meaning — every one of them is rendered `aria-hidden` or
 * beside a real Arabic heading that carries the meaning. Every one of them is
 * also LTR-isolated at the point of use (`<Mono>`), because a bare `// courses`
 * dropped into an RTL paragraph reorders to `courses //`.
 */

/** The section markers, written the way a comment is written in a source file. */
export const MARKERS = {
  hero: 'index',
  why: 'why',
  steps: 'how_it_works',
  courses: 'courses',
  books: 'books',
  instructor: 'instructor',
  tracks: 'tracks',
  honorBoard: 'honor_board',
  about: 'about',
  stats: 'stats',
  testimonials: 'students',
  faq: 'faq',
  cta: 'start',
} as const;

/**
 * The aligned meta keys inside a card — `lessons ....... 12`.
 *
 * Latin and lowercase because the column is a KEY in a data structure, and
 * because an Arabic word here would have to be bidi-isolated against the
 * number beside it on every row; the value is the only part a reader needs,
 * and it is the part that is Arabic wherever Arabic is the right script.
 */
export const META = {
  track: 'track',
  lessons: 'lessons',
  /**
   * `hh:mm`, not «12 ساعة و30 دقيقة».
   *
   * The column has to line up down the card — that is the entire reason the
   * meta is a dotted leader and not a row of chips — and a value whose LENGTH
   * depends on whether the course happens to have round hours cannot. `08:45`
   * is also exact, where a rounded «9 ساعة» on a 8h45 course is not.
   */
  runtime: 'runtime',
  price: 'price',
  pages: 'pages',
  courses: 'courses',
  score: 'score',
} as const;

export const neonCopy = {
  /**
   * The hero's terminal line falls back to this when the `hero` block carries
   * no eyebrow. It is a prompt, so it has to be an instruction rather than a
   * description — «منصة تعليمية» under a `$` reads as a broken variable.
   */
  heroPromptFallback: 'ابدأ من هنا',

  /** Under the hero's mark when the tenant has uploaded no logo — see `<NeonHero>`. */
  markFallbackLabel: 'شعار المنصة',

  /* ── الكورسات ──────────────────────────────────────────────────────── */
  coursesOpen: 'افتح الكورس',
  courseFree: 'مجاني',
  /**
   * The empty catalogue, and this is the FIRST screen a brand-new instructor's
   * students see — a database with no courses in it is the normal state on day
   * one, not an error. So it says what is true («لسه»), says when it changes,
   * and gives the one action that is still worth taking today.
   */
  coursesEmptyFile: 'ls ./courses',
  coursesEmptyComment: '0 نتيجة — الفولدر لسه فاضي',
  coursesEmptyTitle: 'الكورسات لسه بتتجهّز',
  coursesEmptyBody:
    'أول كورس هيتحطّ هنا أول ما يخلص تصوير. اعمل حسابك دلوقتي، وأول ما ينزل هتلاقيه مستنيك.',
  coursesEmptyCta: 'اعمل حساب',
  coursesEmptySecondary: 'شوف الصفوف',

  /* ── الكتب ─────────────────────────────────────────────────────────── */
  booksBuy: 'اطلب الكتاب',
  /**
   * `inStock: false` — the card still renders (a book that vanishes reads as a
   * broken page) but the command is replaced by this, because a «اطلب» button
   * that cannot be honoured is worse than a sold-out label.
   */
  booksOut: 'نفدت الكمية',

  /* ── الصفوف ────────────────────────────────────────────────────────── */
  tracksTitle: 'اختار صفّك',
  tracksLead: 'كل صف وكورساته في مكان واحد.',

  /* ── المدرّس ───────────────────────────────────────────────────────── */
  instructorTitle: 'مين اللي بيشرح؟',
  instructorFile: 'whoami',
  instructorCta: 'كل الكورسات',
  /**
   * The line under the name when the tenant has published nothing yet. It
   * replaces the counts — «0 كورس · 0 محاضرة» under a photograph is the worst
   * possible first impression, and it is also not information.
   */
  instructorEmpty: 'المحتوى بيتبني دلوقتي، ومكانه هنا.',

  /* ── لوحة الشرف ────────────────────────────────────────────────────── */
  honorTitle: 'لوحة الشرف',
  honorLead: 'أسماء الطلبة اللي جابوا أعلى الدرجات في امتحان الشهر.',
  honorFile: 'honor_board.log',
  /**
   * The empty board. Deliberately ONE line and not four reserved places — the
   * classic page draws four outlined slots because its board has a date it
   * fills on, and on a stack whose first exam has not been scheduled the same
   * four boxes read as a section that failed to load. See `<NeonHonorBoard>`.
   */
  honorEmpty: 'اللوحة لسه فاضية — أول اسم هيتكتب هنا بعد أول امتحان.',

  /* ── الخطوات ───────────────────────────────────────────────────────── */
  stepsTitle: 'المنصة بتشتغل إزاي؟',
  stepsLead: 'تلات خطوات، بالترتيب.',
  step1Title: 'اعمل حسابك',
  step1Body: 'دقيقة واحدة: الاسم ورقم الموبايل، وخلاص. من غير أي ورق ولا تحويلات.',
  step2Title: 'اختار الكورس',
  step2Body: 'كل كورس مكتوب عليه عدد المحاضرات والمدة والسعر قبل ما تدفع أي حاجة.',
  step3Title: 'اتفرج وامتحن',
  step3Body: 'المحاضرات متاحة في أي وقت، وبعد كل جزء امتحان يقولك أنت واقف فين بالظبط.',

  /* ── عام ───────────────────────────────────────────────────────────── */
  /** The `<summary>` marker on the FAQ rows, as a screen reader hears it. */
  faqToggle: 'افتح الإجابة',
} as const;
