import { z } from '@ayman/contracts/zod';

/**
 * «ساحة التحدي» — طالبين من نفس الدفعة ونفس الكورس، نفس الأسئلة في نفس
 * اللحظة، واللي يجاوب صح الأول ياخد النقطة.
 *
 * ## السيرفر هو الحَكَم، والمتصفح بيعرض بس
 *
 * كل قرار — مين جاوب الأول، السؤال خلص ولا لأ، الوقت خلص ولا لأ، مين كسب —
 * بيتاخد في الـAPI بساعته هو. المتصفح بيستقبل «الحالة زي ما هي دلوقتي» من
 * وجهة نظر الطالب ده (`ArenaView`) على SSE، وبيبعت الإجابة بـPOST. عشان كده
 * كل فريم بيحمل الحالة كاملة مش «الفرق»: فريم ضاع أو نت قطع ورجع = أول فريم
 * بعده بيصلّح الشاشة لوحده، من غير ما المتصفح يعيد بناء اللي فاته.
 *
 * ⚠️ الإجابة الصح مابتسافرش مع السؤال أبدًا. `correctOptionIds` بيظهر في
 * `reveal` بس، بعد ما السؤال يتقفل للاتنين.
 *
 * ## موديول لوحده
 *
 * subpath جديد (`@ayman/contracts/arena`) مش exports جديدة على موديول قديم:
 * تاب فاضل مفتوح من البيلد اللي قبله بيحتفظ بـmodule ids بتاعته، وexport
 * جديد على موديول هو حمّله قبل كده بيوصله `undefined`
 * (`turbopack-module-ids-outlive-a-deploy`).
 *
 * ⚠️ الـuserId بتاع طالب تاني عمره ما بيتبعت هنا — الاسم المختصر والصورة
 * بس. والـuserId نفسه (لو احتجناه) nanoid من better-auth، مش uuid.
 */

/** قواعد الماتش — مكتوبة مرة واحدة: السيرفر بيحكم بيها والشاشة بتشرحها. */
export const ARENA_RULES = {
  /** أسئلة الماتش الواحد. */
  questions: 7,
  /** وقت السؤال. */
  questionMs: 15_000,
  /** أنيميشن الـVS قبل أول سؤال. */
  vsMs: 4_500,
  /** بعد ما السؤال يتقفل: الإجابة الصح والنقطة، وبعدين اللي بعده. */
  revealMs: 2_800,
  /** «النت عنده قطع…» — قد إيه بنستنى اللي فصل قبل ما التاني ياخد الماتش. */
  graceMs: 20_000,
  /** اللي رجع بعد قطع بيلاقي على الأقل كده في السؤال اللي كان واقف عليه. */
  resumeMinMs: 5_000,
  /** نبضة المتصفح وهو في الطابور أو في ماتش. */
  beatMs: 4_000,
  /** مفيش نبضة من الطالب بقالها كده = النت عنده قطع. */
  beatTtlMs: 12_000,
  /** بعدها الشاشة بتقول «مفيش حد متاح دلوقتي» وبتسأل نستنى ولا لأ. */
  searchPatienceMs: 60_000,
  /**
   * أقل عدد أسئلة لازم يكون في بنك الطالب للكورس ده عشان يدخل الطابور. بنك
   * الاتنين مع بعض بيبقى أكبر من كده دايمًا، فالماتش عمره ما بيقصر.
   */
  minPool: 7,
  /** نقط الساحة — منفصلة تمامًا عن نقط الترتيب (`RANK_POINTS`). */
  points: { win: 3, draw: 1, loss: 0 },
  /** سقف نقط الساحة في اليوم (بتوقيت القاهرة). الماتش بيتلعب عادي بعده. */
  dailyPointsCap: 45,
  /** نفس الاتنين مع بعض: أول ٣ ماتشات في اليوم بس اللي بتجيب نقط. */
  pairScoredPerDay: 3,
} as const;

/** ساعة السيرفر (epoch ms) — المتصفح بيحسب الفرق بينها وبين ساعته. */
const EpochMs = z.number().int().nonnegative();

export const ArenaPlayerSchema = z.object({
  /** «ملك سعيد» — أول اسمين بس، زي «ترتيبي». */
  name: z.string(),
  /** `User.image` — نفس مصدر الأفاتار في باقي المنصة. مش صورة لوحة الشرف. */
  image: z.string().nullable(),
});
export type ArenaPlayer = z.infer<typeof ArenaPlayerSchema>;

/**
 * حالة كل لاعب في السؤال اللي شغّال:
 *   thinking  لسه مجاوبش
 *   locked    جاوب غلط — اتقفل عليه السؤال ده
 *   offline   النت عنده قطع
 */
export const ArenaSideStateSchema = z.enum(['thinking', 'locked', 'offline']);
export type ArenaSideState = z.infer<typeof ArenaSideStateSchema>;

export const ArenaSideSchema = z.object({
  player: ArenaPlayerSchema,
  score: z.number().int().min(0),
  state: ArenaSideStateSchema,
});
export type ArenaSide = z.infer<typeof ArenaSideSchema>;

export const ArenaQuestionSchema = z.object({
  index: z.number().int().min(0),
  /** `question_versions.id`. */
  id: z.string(),
  type: z.enum(['mcq_single', 'true_false']),
  stemHtml: z.string(),
  options: z.array(z.object({ id: z.string(), bodyHtml: z.string() })).min(2),
});
export type ArenaQuestion = z.infer<typeof ArenaQuestionSchema>;

/** مين خد نقطة السؤال — من وجهة نظر اللي بيقرا. */
export const ArenaPointSchema = z.enum(['you', 'opponent', 'none']);
export type ArenaPoint = z.infer<typeof ArenaPointSchema>;

export const ArenaRevealSchema = z.object({
  index: z.number().int().min(0),
  /** بيتبعت بس بعد ما السؤال يتقفل للاتنين. */
  correctOptionIds: z.array(z.string()),
  yourOptionId: z.string().nullable(),
  opponentOptionId: z.string().nullable(),
  winner: ArenaPointSchema,
  /** correct = حد جاوب صح · both_wrong = الاتنين غلطوا · timeout = الوقت خلص. */
  reason: z.enum(['correct', 'both_wrong', 'timeout']),
});
export type ArenaReveal = z.infer<typeof ArenaRevealSchema>;

export const ArenaEndSchema = z.object({
  outcome: z.enum(['win', 'loss', 'draw', 'none']),
  /**
   * completed = الأسئلة خلصت · forfeit = التاني فصل ومارجعش (أو خرج) ·
   * abandoned = الاتنين فصلوا · aborted = السيرفر اتعمله ريستارت.
   */
  reason: z.enum(['completed', 'forfeit', 'abandoned', 'aborted']),
  /** النقط اللي دخلت رصيد الساحة فعلًا (بعد سقف اليوم وسقف نفس المنافس). */
  pointsEarned: z.number().int().min(0),
  /** الماتش كان يستاهل نقط أكتر، والسقف قصّها. */
  capped: z.boolean(),
  /** رصيد الساحة بعد الماتش — `null` لو لسه بيتحسب. */
  totalPoints: z.number().int().min(0).nullable(),
});
export type ArenaEnd = z.infer<typeof ArenaEndSchema>;

export const ArenaPauseSchema = z.object({
  /** مين النت عنده قطع. */
  who: z.enum(['you', 'opponent', 'both']),
  /** لحد إمتى بنستنى (ساعة السيرفر). */
  graceUntil: EpochMs,
});
export type ArenaPause = z.infer<typeof ArenaPauseSchema>;

export const ArenaMatchViewSchema = z.object({
  id: z.string(),
  /**
   * بيزيد مع كل تغيير في الماتش. رد الـPOST وفريم الـSSE ممكن يوصلوا بأي
   * ترتيب، فالمتصفح بيتجاهل أي نسخة أقدم من اللي معاه.
   */
  seq: z.number().int().min(0),
  courseTitle: z.string(),
  cohortLabel: z.string(),
  total: z.number().int().min(1),
  /** السؤال الحالي (أو اللي لسه اتقفل في `reveal`). */
  index: z.number().int().min(0),
  stage: z.enum(['vs', 'question', 'reveal', 'ended']),
  you: ArenaSideSchema,
  opponent: ArenaSideSchema,
  question: ArenaQuestionSchema.nullable(),
  /** نهاية المرحلة الحالية بساعة السيرفر — `null` وهو واقف أو خلص. */
  deadline: EpochMs.nullable(),
  /** وقت السؤال كله، للحلقة. */
  questionMs: z.number().int().positive(),
  /** الماتش واقف لأن حد النت عنده قطع. */
  paused: ArenaPauseSchema.nullable(),
  /** اختيارك الغلط في السؤال ده — عشان يفضل أحمر وإنت مستني. */
  yourPick: z.string().nullable(),
  reveal: ArenaRevealSchema.nullable(),
  /** نتيجة كل سؤال خلص، بالترتيب — نقط الشريط اللي فوق. */
  history: z.array(ArenaPointSchema),
  end: ArenaEndSchema.nullable(),
});
export type ArenaMatchView = z.infer<typeof ArenaMatchViewSchema>;

export const ArenaViewSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('idle') }),
  z.object({
    phase: z.literal('queued'),
    courseId: z.string(),
    courseTitle: z.string(),
    cohortLabel: z.string(),
    /** دخل الطابور إمتى (ساعة السيرفر) — عدّاد «بندوّر بقالنا…». */
    since: EpochMs,
  }),
  z.object({ phase: z.literal('match'), match: ArenaMatchViewSchema }),
]);
export type ArenaView = z.infer<typeof ArenaViewSchema>;

/**
 * إيه اللي لسه حصل — للصوت والأنيميشن بس. الشاشة نفسها بتترسم من `view`،
 * فـfx ضاع = صوت ماشتغلش، مش شاشة غلط.
 */
export const ArenaFxSchema = z.enum([
  'hello',
  'queued',
  'matched',
  'question',
  'you_right',
  'you_wrong',
  'opponent_right',
  'opponent_wrong',
  'both_wrong',
  'timeout',
  'opponent_offline',
  'opponent_back',
  'paused',
  'resumed',
  'end',
  'aborted',
  'no_questions',
  'left_queue',
]);
export type ArenaFx = z.infer<typeof ArenaFxSchema>;

/** فريم SSE واحد. `ping` كل كام ثانية عشان المتصفح يعرف إن الخط لسه عايش. */
export const ArenaFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('view'), at: EpochMs, fx: ArenaFxSchema, view: ArenaViewSchema }),
  z.object({ type: z.literal('ping'), at: EpochMs }),
]);
export type ArenaFrame = z.infer<typeof ArenaFrameSchema>;

// ── الطلبات ───────────────────────────────────────────────────────────────

/** `POST /api/me/arena/queue` — الكورس اللي عايز يلعب فيه. */
export const ArenaQueueRequestSchema = z.object({ courseId: z.uuid() }).strict();
export type ArenaQueueRequest = z.infer<typeof ArenaQueueRequestSchema>;

/** `POST /api/me/arena/matches/:matchId/answer`. */
export const ArenaAnswerRequestSchema = z
  .object({
    /** رقم السؤال اللي المتصفح شايفه — إجابة على سؤال قديم بتتجاهل. */
    index: z.number().int().min(0).max(50),
    optionId: z.uuid(),
  })
  .strict();
export type ArenaAnswerRequest = z.infer<typeof ArenaAnswerRequestSchema>;

/**
 * right/wrong = اتحسبت · late = السؤال كان اتقفل (التاني سبق، أو الوقت خلص) ·
 * ignored = مش سؤالك دلوقتي (جاوبت قبل كده، الماتش واقف، رقم سؤال قديم).
 */
export const ArenaAnswerResultSchema = z.object({
  result: z.enum(['right', 'wrong', 'late', 'ignored']),
  view: ArenaViewSchema,
});
export type ArenaAnswerResult = z.infer<typeof ArenaAnswerResultSchema>;

export const ArenaBeatSchema = z.object({ at: EpochMs, phase: z.enum(['idle', 'queued', 'match']) });
export type ArenaBeat = z.infer<typeof ArenaBeatSchema>;

// ── اللوبي والترتيب ───────────────────────────────────────────────────────

export const ArenaBoardRowSchema = z.object({
  /** ترتيب تنافسي: نفس النقط = نفس الرقم («١، ٢، ٢، ٤»). */
  rank: z.number().int().min(1),
  name: z.string(),
  image: z.string().nullable(),
  points: z.number().int().min(0),
  wins: z.number().int().min(0),
  played: z.number().int().min(0),
  isMe: z.boolean(),
});
export type ArenaBoardRow = z.infer<typeof ArenaBoardRowSchema>;

export const ArenaBoardSchema = z.object({
  cohortLabel: z.string(),
  rows: z.array(ArenaBoardRowSchema),
  /** صفك لو مش في اللي فوق. `null` لو لسه ملعبتش. */
  me: ArenaBoardRowSchema.nullable(),
});
export type ArenaBoard = z.infer<typeof ArenaBoardSchema>;

export const ArenaCourseSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** أسئلة بنك الطالب في الكورس ده. */
  questions: z.number().int().min(0),
  /** `questions >= ARENA_RULES.minPool`. */
  playable: z.boolean(),
});
export type ArenaCourse = z.infer<typeof ArenaCourseSchema>;

export const ArenaMeSchema = z.object({
  name: z.string(),
  image: z.string().nullable(),
  points: z.number().int().min(0),
  wins: z.number().int().min(0),
  draws: z.number().int().min(0),
  losses: z.number().int().min(0),
  played: z.number().int().min(0),
  /** ترتيبك في ساحة دفعتك — `null` لو لسه ملعبتش ولا ماتش. */
  rank: z.number().int().min(1).nullable(),
  todayPoints: z.number().int().min(0),
});
export type ArenaMe = z.infer<typeof ArenaMeSchema>;

/** `GET /api/me/arena`. */
export const ArenaLobbySchema = z.object({
  /** «صفّك: …» — `null` لما البروفايل مالوش سنة. */
  cohort: z.object({ label: z.string() }).nullable(),
  /**
   * ليه مايقدرش يلعب دلوقتي:
   *   no_year          البروفايل مالوش سنة دراسية
   *   no_subscription  مالوش اشتراك شغّال في أي كورس (الاشتراك المجاني مابيحسبش)
   */
  blocked: z.enum(['no_year', 'no_subscription']).nullable(),
  courses: z.array(ArenaCourseSchema),
  me: ArenaMeSchema,
  /** لو كان في طابور أو في ماتش — الصفحة بتكمّل منه. */
  view: ArenaViewSchema,
  board: ArenaBoardSchema,
  /** ساعة السيرفر وقت الرد. */
  at: EpochMs,
});
export type ArenaLobby = z.infer<typeof ArenaLobbySchema>;

// ── الأدمن ────────────────────────────────────────────────────────────────

export const AdminArenaMatchSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  courseTitle: z.string().nullable(),
  cohortLabel: z.string(),
  a: z.object({ name: z.string(), score: z.number().int().min(0), points: z.number().int().min(0) }),
  b: z.object({ name: z.string(), score: z.number().int().min(0), points: z.number().int().min(0) }),
  /** مين كسب: a أو b، و`null` = تعادل أو محدش. */
  winner: z.enum(['a', 'b']).nullable(),
  outcome: z.enum(['completed', 'forfeit', 'abandoned', 'aborted']),
  questions: z.number().int().min(0),
});
export type AdminArenaMatch = z.infer<typeof AdminArenaMatchSchema>;

export const AdminArenaPlayerSchema = z.object({
  name: z.string(),
  image: z.string().nullable(),
  cohortLabel: z.string(),
  points: z.number().int().min(0),
  wins: z.number().int().min(0),
  played: z.number().int().min(0),
});
export type AdminArenaPlayer = z.infer<typeof AdminArenaPlayerSchema>;

/** `GET /api/admin/arena` — للقراية بس. */
export const AdminArenaSchema = z.object({
  totals: z.object({
    matchesToday: z.number().int().min(0),
    matchesWeek: z.number().int().min(0),
    playersWeek: z.number().int().min(0),
  }),
  recent: z.array(AdminArenaMatchSchema),
  top: z.array(AdminArenaPlayerSchema),
});
export type AdminArena = z.infer<typeof AdminArenaSchema>;

// ── حسابات صغيرة بيستعملها الاتنين ──────────────────────────────────────

/** نقط الماتش قبل أي سقف. */
export function arenaBasePoints(outcome: ArenaEnd['outcome']): number {
  if (outcome === 'win') return ARENA_RULES.points.win;
  if (outcome === 'draw') return ARENA_RULES.points.draw;
  return 0;
}

/**
 * النقط اللي تدخل فعلًا: الأساسي، مقصوص على اللي فاضل من سقف اليوم، وصفر
 * لو الاتنين دول لعبوا مع بعض `pairScoredPerDay` ماتش بنقط النهارده.
 */
export function arenaAwardedPoints(input: {
  base: number;
  todayPoints: number;
  pairScoredToday: number;
}): { points: number; capped: boolean } {
  if (input.base <= 0) return { points: 0, capped: false };
  if (input.pairScoredToday >= ARENA_RULES.pairScoredPerDay) return { points: 0, capped: true };
  const left = Math.max(0, ARENA_RULES.dailyPointsCap - input.todayPoints);
  const points = Math.min(input.base, left);
  return { points, capped: points < input.base };
}

/** ترتيب تنافسي على رصيد مترتّب تنازلي: «١، ٢، ٢، ٤». */
export function competitionRanks(points: readonly number[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < points.length; i++) {
    ranks.push(i > 0 && points[i] === points[i - 1] ? ranks[i - 1]! : i + 1);
  }
  return ranks;
}
