import { z } from '@ayman/contracts/zod';

/**
 * «ترتيبي على الدفعة» — `GET /api/me/rank`.
 *
 * ## الترتيب بالنقط، مش بالمتوسط
 *
 * المتوسط لوحده بيكافئ اللي حل حاجة واحدة: كويز واحد بـ١٠٠٪ كان هيطلع صاحبه
 * فوق واحد حل عشرين بـ٩٥٪. والمطلوب بالنص إن الطالب «عشان يتقدّم لازم يسلّم
 * واجباته ويجيب ١٠٠٪ في الكويز وامتحانات نص الشهر» — يعني الشغل نفسه يتحسب،
 * مش جودته بس. فالنقط بتجمع الاتنين: كل حاجة بتتعمل بتزوّد، وكل درجة أعلى
 * بتزوّد أكتر. والمتوسط بيفضل ظاهر جنبها (القرص) لأنه السؤال التاني اللي
 * الطالب بيسأله: «أنا بجيب كام في المتوسط؟».
 *
 * الأرقام هنا مش في السيرفر بس عشان الصفحة بتشرحها للطالب («كل كويز ١٠٠٪ =
 * ١٢٠ نقطة»). لو اتكتبت مرتين، الشرح والحساب هيختلفوا في أول تعديل.
 *
 * مفيش imports نسبية هنا — نفس سبب `activity.ts`: موديول ورقة الاتنين بيوصلوله
 * من الـsubpath.
 */
export const RANK_POINTS = {
  /** الكويز: درجتك بالمية = نقطها (٨٧٪ = ٨٧ نقطة). */
  quizPerPercent: 1,
  /** بونص العلامة الكاملة في الكويز. */
  quizFullMarkBonus: 20,
  /** امتحان نص الشهر وامتحان الكورس: الضعف. */
  examPerPercent: 2,
  examFullMarkBonus: 50,
  /** الواجب: التسليم نفسه له نقط، لأن التسليم هو اللي بنشجّع عليه. */
  homeworkSubmitted: 40,
  /** ولما يتقبل: لحد ٦٠ كمان حسب الدرجة (مقبول من غير درجة = الـ٦٠ كلها). */
  homeworkAcceptedMax: 60,
} as const;

/**
 * المستويات — أسماء معادن وأحجار، مش صفات.
 *
 * «شاطر/متفوّق/عبقري» صفات مذكّرة، والمنصة مابتخاطبش الطالب بصيغة المذكر
 * (`outreach/compose.spec.ts`). «فضة/دهب/ألماس» أسماء، فتتقال لأي حد.
 *
 * العتبات محسوبة على سنة كاملة: محاضرة في الأسبوع بكويز وواجب (≈٢٢٠ نقطة لو
 * كله كامل) وامتحان نص شهر (≈٢٥٠)، يعني الطالب اللي ماشي صح بيعدّي مستوى كل
 * شهر ونص تقريبًا، واللي بيقفل كل حاجة كاملة يوصل «أسطورة» قبل آخر السنة.
 */
export const RANK_LEVELS = [
  { key: 'bronze', nameAr: 'برونز', min: 0 },
  { key: 'silver', nameAr: 'فضة', min: 300 },
  { key: 'gold', nameAr: 'دهب', min: 800 },
  { key: 'platinum', nameAr: 'بلاتين', min: 1600 },
  { key: 'diamond', nameAr: 'ألماس', min: 2800 },
  { key: 'master', nameAr: 'ماستر', min: 4500 },
  { key: 'legend', nameAr: 'أسطورة', min: 7000 },
] as const;

export type RankLevelKey = (typeof RANK_LEVELS)[number]['key'];

export interface RankLevelProgress {
  index: number;
  key: RankLevelKey;
  nameAr: string;
  min: number;
  /** `null` في آخر مستوى — مفيش حاجة بعده. */
  next: { key: RankLevelKey; nameAr: string; min: number } | null;
  /** ٠–١: قد إيه قطع من المسافة للمستوى اللي بعده. ١ في آخر مستوى. */
  progress: number;
}

export function levelFor(points: number): RankLevelProgress {
  const safe = Number.isFinite(points) ? Math.max(0, points) : 0;
  let index = 0;
  for (let i = 0; i < RANK_LEVELS.length; i++) {
    if (safe >= RANK_LEVELS[i]!.min) index = i;
  }
  const current = RANK_LEVELS[index]!;
  const next = RANK_LEVELS[index + 1] ?? null;
  const progress = next ? (safe - current.min) / (next.min - current.min) : 1;
  return {
    index,
    key: current.key,
    nameAr: current.nameAr,
    min: current.min,
    next: next ? { key: next.key, nameAr: next.nameAr, min: next.min } : null,
    progress: Math.min(1, Math.max(0, progress)),
  };
}

const RankRowSchema = z.object({
  rank: z.number().int().min(1),
  points: z.number().int().min(0),
  isMe: z.boolean(),
});

export const CohortRankSchema = z.object({
  /**
   * `null` لما الطالب مالوش سنة دراسية في بروفايله — مفيش دفعة نرتّبه فيها،
   * والصفحة بتبعته يكمّل بياناته بدل ما تقوله «الأول من ١».
   */
  cohort: z
    .object({
      /** «الصف الثاني بكالوريا» من `academic_years`، أو فاضية لو مش لاقيينها. */
      label: z.string(),
      size: z.number().int().min(1),
    })
    .nullable(),
  me: z.object({
    /** ترتيب تنافسي: اتنين بنفس النقط بياخدوا نفس الرقم («١، ٢، ٢، ٤»). */
    rank: z.number().int().min(1).nullable(),
    points: z.number().int().min(0),
    /** «أحسن من ٨٣٪ من الدفعة» — `null` لما الدفعة كلها إنت بس. */
    betterThanPercent: z.number().min(0).max(100).nullable(),
    /**
     * القرص: متوسط الكويزات والامتحانات والواجبات مع بعض، ٠–١٠٠. `null`
     * لحد ما يبقى فيه حاجة واحدة على الأقل اتصححت.
     */
    average: z.number().min(0).max(100).nullable(),
    quizzes: z.object({
      count: z.number().int().min(0),
      average: z.number().min(0).max(100).nullable(),
      fullMarks: z.number().int().min(0),
    }),
    exams: z.object({
      count: z.number().int().min(0),
      average: z.number().min(0).max(100).nullable(),
      fullMarks: z.number().int().min(0),
    }),
    homework: z.object({
      submitted: z.number().int().min(0),
      accepted: z.number().int().min(0),
      /** الواجبات اللي على محاضرات الطالب فتحها — اللي «عليه». */
      owed: z.number().int().min(0),
    }),
    /** ورق لسه بيتصحح: المقالي فيه محسوب صفر لحد ما يتصحح، فالنقط هتزيد. */
    pendingReview: z.number().int().min(0),
  }),
  /** كام نقطة وتعدّي اللي قبلك مباشرة. `null` لو إنت الأول. */
  pointsToNextRank: z.number().int().min(1).nullable(),
  /**
   * التلاتة الأوائل. الاسم أول كلمتين بس — السيرفر بيقصّه قبل ما يبعته، فالاسم
   * الكامل لطالب تاني عمره ما بيوصل للمتصفح.
   */
  podium: z.array(RankRowSchema.extend({ name: z.string() })).max(3),
  /** اللي حواليك: لحد اتنين فوقك واتنين تحتك، من غير أسامي. */
  ladder: z.array(RankRowSchema).max(5),
  /** آخر مرة الدفعة اتحسبت. ترتيبك إنت لايف؛ الباقيين بيتحدّثوا كل كام دقيقة. */
  computedAt: z.iso.datetime(),
});
export type CohortRank = z.infer<typeof CohortRankSchema>;
