/**
 * The words a stack says about ITS OWN SUBJECT, for a stack that does not
 * teach programming.
 *
 * ## Why a second table at all
 *
 * `copy/ar.ts` was written for one subject. «البرمجة وعلوم الحاسب» is welded
 * into the tagline, the title, the meta descriptions, the footer, the about
 * card, the catalogue lead and the link hub — and every one of those reached
 * a second instructor's stack verbatim, because a programming teacher is what
 * every stack has been so far. A physics teacher's site would have announced,
 * in its own `<title>`, that it teaches programming.
 *
 * So every one of those sentences gets a twin here with a `{subject}` hole in
 * it, and the gates (`apps/web/lib/tenant-subject.ts`,
 * `apps/api/src/common/tenant-subject.ts`) choose between the two by
 * `TEACHES_CODE`. A programming stack never reads this file: the gate hands it
 * the original string object, so Ayman's page and the first two instructors'
 * stay byte-identical.
 *
 * ## The rules every line here obeys
 *
 *   · `{subject}` is the subject's Arabic name WITH its article — «الفيزياء»,
 *     «اللغة العربية» — so no template puts a «لـ» or a «بـ» directly in front
 *     of it (that is how «لـالفيزياء» ships). Prepositions stand apart: «في
 *     {subject}».
 *   · Nothing addresses the student in the masculine — the word list is in
 *     `outreach/compose.spec.ts`, and `subject-copy.spec.ts` runs it over this
 *     whole table.
 *   · Nothing names the teacher's gender either. The teacher can be anyone, so
 *     a role is «{subject} — المرحلة الثانوية», never «مدرّس {subject}».
 *   · Nothing about code. A template that says «سطر كود» on a chemistry site is
 *     the bug this file exists to close, and the spec checks for it.
 *   · Nothing about a SYSTEM. A programming stack is البكالوريا by
 *     construction; a physics teacher may teach الثانوية العامة, البكالوريا or
 *     both, so «المرحلة الثانوية» is the only claim true of all three.
 *
 * ## ⚠️ AND NOTHING HERE IMPORTS ANYTHING
 *
 * Same reason as `copy/tenant-sentence.ts`: this module is published as raw
 * TypeScript and read by the API through Node's own loader, which resolves a
 * relative specifier with no extension as a missing file. The gates import the
 * subject list themselves and pass the name in.
 */
export const subjectCopy = {
  /**
   * What a slug the list does not know is called. The preflight refuses one
   * before a deploy, so this only renders on a stack that skipped it — and
   * «المادة» is true of every subject, where the default subject's name would
   * be a confident lie.
   */
  unknownSubject: 'المادة',

  site: {
    /** Under the wordmark, in the title, in the manifest — `copy.site.tagline`'s twin. */
    tagline: '{subject} — المرحلة الثانوية',
  },

  seo: {
    /**
     * `jobTitle` and `hasOccupation.name` on the JSON-LD `Person`. A MASDAR on
     * purpose: «مدرّس» and «مدرّسة» are two people, and this field is about
     * the job, which is the same for both.
     */
    jobTitle: 'تدريس {subject} للمرحلة الثانوية',
    /** `/courses`' meta description. No platform name: the title tag carries it. */
    catalogDescription:
      'كل كورسات {subject} — مرتّبة بالصف الدراسي والنظام، بشرح فيديو وملفات وامتحانات.',
    /**
     * A course page's meta description. `{year}` and `{lessons}` are the same
     * two values `copy.seo.courseDescription` takes; `{subject}` here is the
     * COURSE's own subject, which on a one-subject stack is the stack's.
     */
    courseDescription:
      '{subject} — {year} — {lessons}، فيديو وتمرين واختبار على كل درس، وامتحانات شهرية ودرجات بتبان أول بأول.',
  },

  landing: {
    heroLead:
      'منهج {subject} كامل، بترتيب واحد ثابت: شرح الفكرة، وتمرين عليها، وامتحان في نفس الجلسة.',
    feature1Body: 'مفيش قفزات. كل فكرة جديدة بتتبني على اللي قبلها، بأمثلة محلولة خطوة بخطوة.',
    instructorBody:
      'شرح {subject} لطلبة المرحلة الثانوية: الفكرة الصعبة بتتفكّك لأجزاء صغيرة، وكل جزء وراه تمرين.',
    footerTagline: '{subject} لطلبة المرحلة الثانوية',
    profileRole: '{subject} — المرحلة الثانوية',
    aboutBody1: 'شرح {subject} لطلبة المرحلة الثانوية، بالترتيب ومن غير قفزات.',
    aboutRole: '{subject} — المرحلة الثانوية',
    /** `{name}` is the page's own subject — `tenantName(copy.landing.aboutPageTitle)`. */
    aboutPageRoleTitle: '{name} — {subject} للمرحلة الثانوية',
    aboutPageLead: '{subject} لطلبة المرحلة الثانوية.',
    aboutPageDescription:
      '{name} — شرح {subject} لطلبة المرحلة الثانوية، بفيديو وتمرين على كل درس واختبارات بتقيس المستوى أول بأول.',
    /** The first of the about card's three chips, in place of «شرح بالكود». */
    aboutChip1: 'شرح خطوة بخطوة',

    /**
     * The `yearTracks` block, rendered as three plain year cards instead of
     * three editor windows. The section header names the years rather than a
     * «track»: on a programming stack the first card was «التأسيس», a glossary
     * of code terms, and without it the section is simply the three years.
     */
    tracksBadge: 'الصفوف',
    tracksTitle: 'كورسات كل صف في مكانها',
    tracksLead: 'من أول ثانوي لحد آخر سنة — كل صف ليه صفحته، وكورساته مرتّبة بنفس ترتيب المنهج.',
    /** `{n}` is the two-digit year, the same «· 01» rhythm the code cards used. */
    trackYearTag: 'الصف · {n}',
    trackYearTitles: ['الصف الأول', 'الصف الثاني', 'الصف الثالث'],
    /** `{year}` is one of `trackYearTitles` — «كورسات الصف الأول الثانوي: …». */
    trackYearBody: 'كورسات {year} الثانوي: شرح المنهج، وتمارين، ومراجعة قبل كل امتحان.',
    trackYearCta: 'كورسات الصف',
  },

  catalog: {
    subtitle: 'كل محاضرات {subject}، مرتّبة بالصف والمسار',
  },

  /**
   * «نيوز» — what the section promises. Deliberately thin: on a new stack it
   * holds whatever the instructor writes, and `copy.news`'s own warning applies
   * here too — an `<h1>` describing an intention is a defect.
   */
  news: {
    heading: 'شرح منهج {subject}',
    subtitle: 'مقالات مكتوبة بتشرح دروس {subject}، مفتوحة للقراية من غير حساب.',
    description:
      'شرح منهج {subject} لطلبة المرحلة الثانوية: مقالات مكتوبة بتشرح الدروس، مفتوحة للقراية من غير حساب.',
  },

  subscribePage: {
    metaDescription:
      'خطوات الاشتراك في كورسات {subject}: عمل حساب، واختيار الباقة، والتحويل بإنستاباي أو فودافون كاش، ورفع صورة التحويل.',
  },

  books: {
    metaDescription:
      'كتب {subject} بالترم الأول والتاني: شرح وأسئلة ونماذج امتحانات، والطلب بيتشحن لحد باب البيت.',
  },

  linkhub: {
    role: '{subject} — المرحلة الثانوية',
    coursesNote: 'كل محاضرات {subject}، مرتّبة بالصف',
    newsNote: 'مقالات قصيرة بالعربي بتشرح المنهج',
  },

  /**
   * What a student types into a search box or an assistant, for the
   * registries that read `/.well-known/ai-catalog.json`. Real query shapes, not
   * a keyword list — see that route's note on `representativeQueries`.
   *
   * «مدرس» appears here and nowhere else in this table, and that is the one
   * exception the header's rule allows: these are the STUDENT'S words, quoted
   * so a registry can match them, not this platform describing its teacher.
   */
  queries: {
    catalog: [
      'الكورس بكام',
      'سعر كورس {subject} ثانوي',
      'كورسات {subject} للمرحلة الثانوية',
      'شرح {subject} أولى وتانية وتالتة ثانوي',
    ],
    teacher: ['مين أحسن مدرس {subject} للثانوية', 'أفضل مدرس {subject} ثانوي'],
    books: ['كتاب {subject} ثانوي', 'اطلب كتاب {subject} أونلاين ويوصل البيت'],
    news: ['شرح منهج {subject} ثانوي', 'ملخص {subject} ثانوي', 'نماذج أسئلة {subject} بالإجابات'],
  },

  assistant: {
    /**
     * The last of المساعد's four opening chips — the one that says the subject
     * itself is fair game. A question in the student's voice, like the other
     * three, and with no imperative in it.
     */
    subjectStarter: 'ممكن شرح لفكرة صعبة في {subject}؟',
  },

  /**
   * The onboarding questions a one-subject stack asks again: which SYSTEM and
   * which TRACK. A programming stack fills both from the taxonomy and never
   * shows these.
   */
  onboarding: {
    /** The year select's placeholder until a system is chosen — the city
     *  select's «بعد المحافظة» pattern. */
    yearNeedsSystem: 'بعد اختيار النظام الدراسي',
    systemError: 'لازم نحدد النظام الدراسي',
    trackError: 'لازم نحدد المسار',
  },
} as const;

/**
 * One template with its holes filled.
 *
 * `split`/`join` per key rather than a regex `replace`, for the reason
 * `swapInstructorName` gives: the values are data, and a `replace` with a
 * string needle fills the FIRST hole only. A hole with no value is left as it
 * is — loudly visible in a review — rather than silently emptied.
 */
export function fillSubject(template: string, vars: Readonly<Record<string, string>>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) out = out.split(`{${key}}`).join(value);
  return out;
}
