/**
 * «نتيجة الامتحان لولي الأمر» — the WhatsApp message a guardian receives when
 * a paper is graded, from the linked device (`GuardianResultSweeper`).
 *
 * A module of its own rather than more exports on `copy/outreach.ts`, for the
 * same Turbopack reason `copy/outreach-auto.ts` gives: module ids are
 * path-derived, and a new export on a module the browser already holds can
 * break a tab left open across the deploy.
 *
 * ## Who is reading, and what that changes
 *
 * Every other pool in the outreach copy is said TO the student. This one is
 * said to a parent ABOUT the student, so:
 *
 *   · the parent is «حضرتك», and nothing is conjugated for them either — no
 *     «تقدر», «حابب», «معاك». The platform does not know whether a mother or a
 *     father holds that number;
 *   · the student is `{name}` and NOTHING agrees with the name. No «خلّص»
 *     beside it (a girl «خلّصت»), no «ابنك» (a daughter is «بنتك»), no ـه/ـها
 *     pointing back at them. Every line hangs the name off a noun — «نتيجة
 *     {name}», «قدام {name}» — which is one spelling for both;
 *   · it is a report, not coaching. No question numbers, no topics: those are
 *     the student's, and they are in the student's own message and paper.
 *
 * The lines are run through `compose.spec.ts`'s masculine-form tripwire with
 * every other pool.
 *
 * ## Placeholders
 *
 *   {instructor}  who is sending — `tenantName(OUTREACH_SIGNATURE)`, never a
 *                 literal name (CLAUDE.md §2)
 *   {name}        the student's first name
 *   {quiz}        the quiz/exam title
 *   {score}       integer percent
 */

export const GUARDIAN_RESULT_GREETINGS = [
  'السلام عليكم ورحمة الله 🌷',
  'أهلاً بحضرتك 👋',
  'السلام عليكم، يا رب حضرتك بخير.',
  'أهلاً وسهلاً بحضرتك.',
] as const;

export const GUARDIAN_RESULT_INTROS = [
  'مع حضرتك {instructor} — دي نتيجة {name} في «{quiz}» على المنصة.',
  '{instructor} مع حضرتك. نتيجة {name} في «{quiz}» نزلت.',
  'رسالة من {instructor}: ورقة {name} في «{quiz}» اتصححت.',
  'مع حضرتك {instructor}، وده تقرير سريع عن نتيجة {name} في «{quiz}».',
] as const;

/** Keyed by the same four bands as the student's message (`bandFor`). */
export const GUARDIAN_RESULT_SCORE_LINES = {
  excellent: [
    'الدرجة {score}٪ — مستوى ممتاز بجد.',
    '{score}٪، ودي نتيجة تفرّح.',
    '{score}٪. شغل ممتاز، والمذاكرة باينة في الورقة.',
  ],
  strong: [
    '{score}٪ — مستوى كويس جداً، وفاضل حاجات صغيرة بس.',
    'الدرجة {score}٪، والأساس مظبوط.',
    '{score}٪. نتيجة حلوة، وقريبة من الكامل.',
  ],
  fair: [
    '{score}٪. فيه أجزاء محتاجة مراجعة، وكلها بسيطة.',
    'الدرجة {score}٪ — نص الطريق خلص، والباقي بيتظبط بالمراجعة.',
    '{score}٪. نتيجة مقبولة، وفيه نقط محتاجة شوية تركيز.',
  ],
  weak: [
    '{score}٪. الدرس ده محتاج مراجعة تانية، وده بيحصل وبيتظبط.',
    'الدرجة {score}٪ — المحاضرة دي محتاجة رجوع ليها، وأنا موجود لأي سؤال.',
    '{score}٪. النتيجة أقل من المطلوب، بس الحاجات الناقصة واضحة والرجوع ليها سهل.',
  ],
} as const;

export const GUARDIAN_RESULT_CLOSERS = [
  'تفاصيل الورقة كلها — الأسئلة والإجابات — موجودة قدام {name} على المنصة.',
  'لأي استفسار، الرد هنا على نفس الرقم.',
  'شكراً لمتابعة حضرتك 🌷',
  'متابعة حضرتك بتفرق جداً، وشكراً.',
] as const;
