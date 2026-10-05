import { z } from '@ayman/contracts/zod';

/**
 * «قسم التحديات» — المواضيع اللي الطلبة بيتحدّوا فيها، بدل «الكورس كله».
 *
 * الأدمن بيعمل لكل كورس مواضيع بأسماء: «الوحدة الأولى»، «الدرس التالت بس»،
 * «الدرس الرابع بس» — كل موضوع = عنوان + وحدات و/أو دروس من نفس الكورس +
 * تشغيل/إيقاف + ترتيب. الطالب بيشوف المتشغّل بس، وبيختار واحد أو أكتر.
 *
 * ## البنك هو أسئلة الدروس، سواء الطالب حل الكويز ولا لأ
 *
 * كل سؤال اختيار من متعدد أو صح/غلط جاهز (`ready`) ومش متشال، مربوط بدرس من
 * دروس الموضوع بأي طريقة من التلاتة: سؤال في كويز الدرس (slot أو pool)، سؤال
 * في «أسئلة الألعاب» بتاعة الدرس، أو سؤال مربوط بالدرس مباشرةً
 * (`QuestionBankEntry.lessonId` — من «لصق أسئلة» بسطر `LESSON:`). وماعدا أي
 * سؤال داخل في امتحان شهر أو امتحان كورس لسه الطالب ماسلّموش، أو امتحان لسه
 * مسودة — اللعبة ماتبقاش حل نموذجي لامتحان قبل ما يتعمل.
 *
 * ## كل سؤال محسوب على درس واحد
 *
 * سؤال الكويز على المحاضرة اللي الكويز بعدها (زي `GameService.pool`)، وسؤال
 * مربوط مباشرةً أو في «أسئلة الألعاب» على درسه. سؤال مربوط بكذا درس بيتحسب
 * على أول واحد بالترتيب ده (المباشر، الألعاب، الكويز) — ده اللي بيخلّي العدّ
 * جنب كل اختيار عند الطالب صح وهو بيجمع كذا موضوع: الدروس بتتجمع، والأرقام
 * بتتجمع من غير تكرار.
 *
 * ## الكورس التأسيسي برّه
 *
 * مفيش علامة على الكورس بتقول «تأسيسي» — نفس مطابقة الاسم اللي
 * `apps/web/lib/foundation-courses.ts` بيعملها. التأسيسي عمره ما بيظهر في
 * الألعاب ولا التحديات ولا الساحة.
 *
 * موديول لوحده، مش exports جديدة على `quiz/game`: تاب فاضل مفتوح من البيلد
 * اللي قبله بيحتفظ بالـmodule ids بتاعته (`turbopack-module-ids-outlive-a-deploy`).
 * مفيش imports نسبية هنا — نفس سبب `quiz/history.ts`.
 */

/** «تأسيس» في اسم الكورس أو تحت اسمه — شوف فوق. */
const FOUNDATION = /تأسيس/;

export function isFoundationCourse(course: { title: string; subtitle?: string | null }): boolean {
  return FOUNDATION.test(course.title) || FOUNDATION.test(course.subtitle ?? '');
}

export const CHALLENGE_TOPIC_TITLE_MAX = 80;
/** سقف عملي — كورس فيه ١٠ وحدات و٦٠ درس، والسقف أكبر بكتير. */
const MAX_SECTIONS = 100;
const MAX_LESSONS = 500;

/**
 * أقل عدد أسئلة لكل لعبة في التحدّي. الألعاب التلاتة نفس `GAME_MIN_QUESTIONS`
 * (مكرّرة هنا عشان الموديول ده مايستوردش `quiz/game` والعكس بيحصل)، و«تدريب»
 * بيبدأ من ٣، والساحة من `ARENA_RULES.minPool`.
 */
export const CHALLENGE_MIN_QUESTIONS = {
  millionaire: 15,
  race: 5,
  survival: 5,
  practice: 3,
  arena: 7,
} as const;
export type ChallengeMinKey = keyof typeof CHALLENGE_MIN_QUESTIONS;
export const CHALLENGE_MIN_KEYS = ['millionaire', 'race', 'survival', 'practice', 'arena'] as const;

/** «تدريب»: مفيش تايمر، فالسقف على المدة دقيقتين للسؤال — للإحصائيات بس. */
export const PRACTICE_SECONDS_PER_QUESTION = 120;

// ── لوحة التحكم ─────────────────────────────────────────────────────────

const TitleSchema = z
  .string()
  .trim()
  .min(1, 'اكتب اسم للتحدّي')
  .max(CHALLENGE_TOPIC_TITLE_MAX, `الاسم أطول من ${CHALLENGE_TOPIC_TITLE_MAX} حرف`);

/** `POST /api/admin/challenge-topics/:courseId`. */
export const ChallengeTopicInputSchema = z
  .object({
    title: TitleSchema,
    sectionIds: z.array(z.uuid()).max(MAX_SECTIONS),
    lessonIds: z.array(z.uuid()).max(MAX_LESSONS),
    isActive: z.boolean(),
  })
  .strict()
  .refine((value) => value.sectionIds.length + value.lessonIds.length > 0, {
    message: 'اختار وحدة أو درس واحد على الأقل',
    path: ['lessonIds'],
  });
export type ChallengeTopicInput = z.infer<typeof ChallengeTopicInputSchema>;

/**
 * `PATCH /api/admin/challenge-topics/:courseId/:topicId` — كل حقل اختياري،
 * ومن غير `.default()` خالص: `.partial()` على سكيمة فيها defaults كان بيرجّع
 * الحقل الغايب بقيمته الافتراضية ويمسح اللي محفوظ (`partial-patch-injected-defaults`).
 */
export const ChallengeTopicPatchSchema = z
  .object({
    title: TitleSchema.optional(),
    sectionIds: z.array(z.uuid()).max(MAX_SECTIONS).optional(),
    lessonIds: z.array(z.uuid()).max(MAX_LESSONS).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type ChallengeTopicPatch = z.infer<typeof ChallengeTopicPatchSchema>;

/** `PUT /api/admin/challenge-topics/:courseId/order` — كل التحديات بالترتيب الجديد. */
export const ChallengeTopicOrderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200) }).strict();
export type ChallengeTopicOrder = z.infer<typeof ChallengeTopicOrderSchema>;

const ReadyCountsSchema = z.object({
  /** كل الأسئلة الجاهزة في التحدّي. */
  total: z.number().int().min(0),
  /** اللي بيوصل طلبة المدارس العربي (دروس `forGeneral`). */
  general: z.number().int().min(0),
  /** اللي بيوصل طلبة اللغات (دروس `forLanguages`). */
  languages: z.number().int().min(0),
});

export const AdminChallengeTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  isActive: z.boolean(),
  position: z.number().int(),
  sectionIds: z.array(z.string()),
  lessonIds: z.array(z.string()),
  /** وحدات أو دروس اتمسحت أو مابقتش في الكورس — بتتشال في أول حفظ. */
  missing: z.number().int().min(0),
  ready: ReadyCountsSchema,
});
export type AdminChallengeTopic = z.infer<typeof AdminChallengeTopicSchema>;

export const AdminChallengeLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  /** أسئلة جاهزة محسوبة على الدرس ده (كل المصادر). */
  ready: z.number().int().min(0),
  forGeneral: z.boolean(),
  forLanguages: z.boolean(),
});
export type AdminChallengeLesson = z.infer<typeof AdminChallengeLessonSchema>;

/** `GET /api/admin/challenge-topics/:courseId`. */
export const AdminChallengeTopicsSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  /** الكورس التأسيسي — التحديات مقفولة عليه. */
  foundation: z.boolean(),
  /** الوحدات والدروس اللي ينفع تتحط في تحدّي، بترتيب الكورس. */
  sections: z.array(
    z.object({ id: z.string(), title: z.string(), ready: z.number().int().min(0), lessons: z.array(AdminChallengeLessonSchema) }),
  ),
  topics: z.array(AdminChallengeTopicSchema),
});
export type AdminChallengeTopics = z.infer<typeof AdminChallengeTopicsSchema>;

/** أقل لعبة التحدّي ده مايكفيهاش — للتحذير في اللوحة. */
export function challengeShortFor(ready: number): ChallengeMinKey[] {
  return CHALLENGE_MIN_KEYS.filter((key) => ready < CHALLENGE_MIN_QUESTIONS[key]);
}

// ── صفحة الطالب ─────────────────────────────────────────────────────────

const LevelCountsSchema = z.object({ easy: z.number().int(), medium: z.number().int(), hard: z.number().int() });
export type ChallengeLevelCounts = z.infer<typeof LevelCountsSchema>;

/** تحدّي متشغّل في كورس الطالب، بدروسه بعد ما الوحدات اتفردت. */
export const GameHubTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  lessonIds: z.array(z.string()),
});
export type GameHubTopic = z.infer<typeof GameHubTopicSchema>;

/** كام سؤال في الدرس ده في كل مستوى — بنك الطالب ده (نظامه، والامتحانات اللي لسه). */
export const TopicBucketSchema = z.object({
  lessonId: z.string(),
  counts: LevelCountsSchema,
});
export type TopicBucket = z.infer<typeof TopicBucketSchema>;

/** دروس كذا تحدّي مع بعض، من غير تكرار. */
export function topicLessonIds(topics: readonly GameHubTopic[], ids: readonly string[]): Set<string> {
  const wanted = new Set(ids);
  const lessons = new Set<string>();
  for (const topic of topics) if (wanted.has(topic.id)) for (const id of topic.lessonIds) lessons.add(id);
  return lessons;
}

/**
 * كام سؤال في التحديات دي مع بعض، لكل مستوى — نفس الحساب في المتصفح (الرقم
 * جنب كل اختيار) وفي السيرفر (`poolSize`)، لأن كل سؤال على درس واحد.
 */
export function topicCounts(
  topics: readonly GameHubTopic[],
  buckets: readonly TopicBucket[],
  ids: readonly string[],
): ChallengeLevelCounts {
  const lessons = topicLessonIds(topics, ids);
  const sum = { easy: 0, medium: 0, hard: 0 };
  for (const bucket of buckets) {
    if (!lessons.has(bucket.lessonId)) continue;
    sum.easy += bucket.counts.easy;
    sum.medium += bucket.counts.medium;
    sum.hard += bucket.counts.hard;
  }
  return sum;
}

// ── «ماتكرّرش السؤال» ──────────────────────────────────────────────────

/**
 * مفتاح مجموعة الصيغ في «لصق أسئلة» (`GROUP: loops-1`): حروف عربي أو لاتيني
 * وأرقام و`_ - .` بس، لحد ٦٤. من غير مسافات عشان سطر زي «GROUP: الحلقات 1»
 * مايتقريش مجموعتين مختلفتين بمسافة زيادة.
 */
export const VARIANT_GROUP_KEY = /^[\p{L}\p{N}_.-]{1,64}$/u;

/** المجموعة اللي «ماتكرّرش» بيتحسب عليها، والسؤال لوحده جوّاها. */
export function exposureKeys(entry: { bankEntryId: string; variantGroupKey: string | null }): {
  group: string;
  entry: string;
} {
  const own = `e:${entry.bankEntryId}`;
  return { group: entry.variantGroupKey ? `g:${entry.variantGroupKey}` : own, entry: own };
}

export interface Exposure {
  /** epoch ms — آخر مرة اتشاف. */
  at: number;
  times: number;
}

/**
 * الترتيب اللي الأسئلة بتتسحب بيه: اللي ماتشافش الأول، وبعدين الأقدم. وفي
 * المجموعة الواحدة صيغة واحدة بس — اللي اتشافت أقل (وبعدين الأقدم). بيور:
 * `random` بيتحقن عشان التست يبقى ثابت.
 */
export function freshFirst<T extends { bankEntryId: string; variantGroupKey: string | null }>(
  entries: readonly T[],
  seen: ReadonlyMap<string, Exposure>,
  random: () => number = Math.random,
): T[] {
  const groups = new Map<string, Array<{ item: T; tie: number }>>();
  for (const item of entries) {
    const keys = exposureKeys(item);
    const list = groups.get(keys.group) ?? [];
    list.push({ item, tie: random() });
    groups.set(keys.group, list);
  }
  const picked: Array<{ item: T; at: number; tie: number }> = [];
  for (const [group, list] of groups) {
    list.sort((a, b) => {
      const ea = seen.get(exposureKeys(a.item).entry);
      const eb = seen.get(exposureKeys(b.item).entry);
      return (ea?.times ?? 0) - (eb?.times ?? 0) || (ea?.at ?? -1) - (eb?.at ?? -1) || a.tie - b.tie;
    });
    const best = list[0]!;
    picked.push({ item: best.item, at: seen.get(group)?.at ?? -1, tie: best.tie });
  }
  picked.sort((a, b) => a.at - b.at || a.tie - b.tie);
  return picked.map((entry) => entry.item);
}
