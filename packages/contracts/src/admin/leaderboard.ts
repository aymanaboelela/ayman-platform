import { z } from '@ayman/contracts/zod';
import { PAGE_SIZES } from '@ayman/contracts/admin/list';
import { RANK_LEVELS, type RankLevelKey } from '@ayman/contracts/rank';

/**
 * «الأوائل» — `GET /api/admin/leaderboard`، ترتيب الدفعة كلها من ناحية المدرّس.
 *
 * ## نفس الأرقام اللي الطالب شايفها، مش حساب تاني
 *
 * الطالب بيشوف ترتيبه في `/rank` (`CohortRankService`)، والمدرّس هنا بيشوف
 * نفس الدفعة من فوق. لو الشاشتين اتحسبوا بمعادلتين، أول ما طالب يقول «أنا
 * التالت» والمدرّس يلاقيه الخامس هيبقى فيه سؤال مالوش إجابة. فالسيرفر بيقرا
 * نفس الكاش اللي `/api/me/rank` بيقرا منه (نفس الدفعة، نفس النقط من
 * `RANK_POINTS`، نفس الترتيب التنافسي «١، ٢، ٢، ٤»)، والفرق الوحيد إن الطالب
 * صفه هو بيتحسب لايف وكل الباقيين من لقطة عمرها لحد خمس دقايق — والشاشة دي
 * كلها من اللقطة، و`computedAt` بيقول عمرها كام.
 *
 * ## الدفعة = النظام × السنة، مش عربي/لغات
 *
 * ده التقسيم اللي الترتيب نفسه ماشي عليه (`academic_years`). عربي/لغات
 * (`stream`) فلتر على **العرض** بس: بيضيّق القايمة من غير ما يغيّر رقم حد —
 * زي البحث بالظبط. لو كان بيعيد الترتيب، طالبة الأولى على الدفعة كانت هتظهر
 * «الأولى» في شاشة و«التالتة» في التانية.
 *
 * ⚠️ `userId` هنا `string` مش `uuid`: IDs الحسابات من better-auth نانو-آيديز
 * (`better-auth-ids-are-nanoids`)، و`z.uuid()` كان هيعدّي كل فيكستشر ويوقّع
 * كل طالب حقيقي.
 */

/** خمسين في الصفحة: الترتيب بيتقري كقايمة طويلة، وعشرين بتخلّي الأول والتلاتين في صفحتين. */
export const LEADERBOARD_PER_PAGE = 50;

export const LeaderboardQuerySchema = z.object({
  /** من غير سنة = السيرفر بيختار أكبر دفعة. */
  year: z.coerce.number().int().min(1).max(12).optional(),
  /**
   * النظام. من غير نظام مع سنة = السنة كلها، وده بالظبط الدفعة اللي طالب
   * بروفايله من غير نظام بيتقارن بيها (شوف `CohortRankService.cohort`).
   */
  systemId: z.uuid().optional(),
  /** بالاسم (من غير همزة كمان) أو بالموبايل. */
  q: z.string().trim().max(120).default(''),
  stream: z.enum(['general', 'languages']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .default(LEADERBOARD_PER_PAGE),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;

const TallySchema = z.object({
  count: z.number().int().min(0),
  average: z.number().min(0).max(100).nullable(),
  fullMarks: z.number().int().min(0),
});

export const LeaderboardStudentSchema = z.object({
  userId: z.string().min(1),
  /** ترتيب تنافسي على الدفعة كلها — قبل البحث والفلتر، مش بعدهم. */
  rank: z.number().int().min(1),
  fullName: z.string(),
  /**
   * `User.image` — صورة الطالب نفسه (مفتاح تخزين أو رابط جوجل). مش
   * `honor_photo_key`: دي الصورة اللي بتتنشر للعامة على لوحة الشرف وبتتحط
   * بإيد المدرّس، والشاشة دي داخلية، زي كارت الحضور وماسح الباب.
   */
  avatar: z.string().nullable(),
  phone: z.string().nullable(),
  governorate: z.string().nullable(),
  city: z.string().nullable(),
  stream: z.enum(['general', 'languages']).nullable(),
  /**
   * `false` لبروفايل اتعمل قبل سؤال النظام. الطالب ده في `/rank` بيتقارن
   * بالسنة كلها مش بالنظام ده بس، فرقمه هنا ممكن يختلف عن اللي هو شايفه —
   * والشاشة بتقول كده بدل ما تسكت.
   */
  systemKnown: z.boolean(),
  points: z.number().int().min(0),
  /** القرص بتاع الطالب: كويزات وامتحانات وواجبات بأوزانهم. */
  average: z.number().min(0).max(100).nullable(),
  quizzes: TallySchema,
  exams: TallySchema,
  homework: z.object({
    submitted: z.number().int().min(0),
    accepted: z.number().int().min(0),
    owed: z.number().int().min(0),
  }),
  pendingReview: z.number().int().min(0),
  lastActiveAt: z.iso.datetime().nullable(),
});
export type LeaderboardStudent = z.infer<typeof LeaderboardStudentSchema>;

export const LeaderboardCohortSchema = z.object({
  year: z.number().int(),
  systemId: z.uuid().nullable(),
  /** «الصف الثاني بكالوريا» من `academic_years`. */
  label: z.string(),
  /** كام طالب في الدفعة — اللي ليهم سنة ومشتركين في كورس واحد على الأقل. */
  size: z.number().int().min(0),
});
export type LeaderboardCohort = z.infer<typeof LeaderboardCohortSchema>;

export const AdminLeaderboardSchema = z.object({
  /** التابات: كل نظام × سنة في `academic_years`، بعدد كل واحدة. */
  cohorts: z.array(LeaderboardCohortSchema),
  /** `null` لما مفيش ولا دفعة فيها حد لسه. */
  cohort: LeaderboardCohortSchema.extend({
    /** اللي جمعوا نقطة واحدة على الأقل. */
    active: z.number().int().min(0),
    averagePoints: z.number().min(0),
    /** ورق الدفعة اللي لسه بيتصحح — نقطهم هتزيد أول ما يتصحح. */
    pendingReview: z.number().int().min(0),
    /**
     * كام طالب في كل مستوى (`RANK_LEVELS`، بالترتيب) — نفس المستوى اللي
     * الطالب شايفه تحت ترتيبه. بيتحسب على الدفعة كلها في السيرفر، لأن الصفحة
     * معاها خمسين صف بس.
     */
    levels: z.array(
      z.object({
        key: z.enum(RANK_LEVELS.map((level) => level.key) as [RankLevelKey, ...RankLevelKey[]]),
        count: z.number().int().min(0),
      }),
    ),
    computedAt: z.iso.datetime(),
  }).nullable(),
  /** التلاتة الأوائل بنقط — نفس قاعدة منصة الطالب: منصة من غير نقط مش منصة. */
  podium: z.array(LeaderboardStudentSchema).max(3),
  rows: z.array(LeaderboardStudentSchema),
  /** بعد البحث والفلتر — للصفحات. */
  rowCount: z.number().int().min(0),
  /** مشتركين في كورس ومن غير سنة في البروفايل: مالهمش دفعة، فمش في أي تاب. */
  unplaced: z.number().int().min(0),
});
export type AdminLeaderboard = z.infer<typeof AdminLeaderboardSchema>;

/**
 * «الترتيب في الدفعة: #٤ من ١٢٠» على صفحة الطالب في الأدمن —
 * `GET /api/admin/leaderboard/students/:userId`.
 *
 * نفس حساب `/api/me/rank` بالحرف (صف الطالب لايف، والباقيين من الكاش)، يعني
 * الرقم ده هو اللي الطالب شايفه دلوقتي. و`size` هنا عادي: الرقم اتشال من
 * صفحة الطالب لأنه رقم بيزنس، والمدرّس هو صاحب البيزنس.
 */
export const AdminStudentRankSchema = z.object({
  cohort: LeaderboardCohortSchema.nullable(),
  rank: z.number().int().min(1).nullable(),
  points: z.number().int().min(0),
});
export type AdminStudentRank = z.infer<typeof AdminStudentRankSchema>;
