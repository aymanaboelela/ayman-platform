import { examPhase } from '@ayman/contracts/quiz/scheduled';
import type { RankNextExam, RankNextQuizState } from '@ayman/contracts/rank-next';
import { decideNextSitting, type AllowanceAttempt } from '../quiz/attempt-allowance';

/**
 * «الطريق لفوق» — القواعد نفسها، من غير داتابيز.
 *
 * `RankNextService` بيجيب الصفوف ويعدّيها على البوابة، والملف ده بيقرر: الكويز
 * ده ناقص ولا لأ، وحالته إيه، والصفوف بتترتّب إزاي، وأنهي امتحان هو «الجاي».
 * لوحده عشان يتختبر بجدول حالات مش بفيكستشر داتابيز لكل حالة.
 */

/**
 * نفس عتبة `CohortRankService`: «٩٩٫٩٩٥» مش ١٠٠، لأن `scaled / gradeOutOf *
 * 100` على Decimal ممكن يطلع ٩٩٫٩٩٩٩ لورقة كاملة. لو الاتنين اختلفوا، الكويز
 * هيتحسب له البونص في الترتيب ويفضل ظاهر هنا إنه ناقص.
 */
export const FULL_MARK_PERCENT = 99.995;

/** اللي القاعدة محتاجاه من محاولة. */
export interface NextAttempt extends AllowanceAttempt {
  submittedAt: Date | null;
  /** `quiz_attempts.grade_out_of` — لقطة المحاولة، مش الكويز النهارده. */
  gradeOutOf: number;
}

export interface NextQuizFacts {
  allowsImprovement: boolean;
  openFrom: Date | null;
  openUntil: Date | null;
  attempts: readonly NextAttempt[];
}

export interface QuizVerdict {
  state: RankNextQuizState;
  bestPercent: number | null;
  /** اتقفل بالعلامة الكاملة — مابيطلعش في «الطريق لفوق» خالص. */
  full: boolean;
}

const FINISHED = new Set<NextAttempt['state']>(['submitted', 'pending_review']);
const OPEN = new Set<NextAttempt['state']>(['in_progress', 'overdue']);

/**
 * درجة محاولة بالمية، بنفس حساب `CohortRankService.scores`: الدرجة على لقطة
 * `grade_out_of` بتاعة المحاولة، ومسقوفة عند ١٠٠، وورقة من صفر = صفر.
 *
 * محاولة من غير `scaledScore` مالهاش درجة (`null`) — مابتتحسبش صفر ولا ١٠٠.
 */
export function attemptPercent(attempt: Pick<NextAttempt, 'scaledScore' | 'gradeOutOf'>): number | null {
  if (!(attempt.gradeOutOf > 0)) return 0;
  if (attempt.scaledScore === null) return null;
  return Math.min(100, (attempt.scaledScore / attempt.gradeOutOf) * 100);
}

/**
 * الكويز ده فين من العلامة الكاملة، وأقدر أعمل فيه إيه دلوقتي.
 *
 * «المحاولة التانية» مش حساب هنا: `decideNextSitting` هي نفس الدالة اللي
 * صفحة الكويز بتقرر بيها «ابدأ» ولا «مفيش محاولات». والميعاد `examPhase`، نفس
 * اللي `assertCanAttempt` بيقفل بيه. فالصف مايقولش «فيه إعادة» على باب السيرفر
 * هيقفله.
 */
export function classifyQuiz(facts: NextQuizFacts, now: Date): QuizVerdict {
  const finished = facts.attempts.filter((a) => FINISHED.has(a.state) && a.submittedAt !== null);
  const scores = finished.map(attemptPercent).filter((p): p is number => p !== null);
  const bestPercent = scores.length > 0 ? floor1(Math.max(...scores)) : null;
  const full = scores.some((p) => p >= FULL_MARK_PERCENT);

  const state = ((): RankNextQuizState => {
    if (facts.attempts.some((a) => OPEN.has(a.state))) return 'resume';
    // ورق كله لسه عند المدرّس: الدرجة اللي معانا مؤقتة (المقالي صفر لحد ما
    // يتصحح)، فـ«٦٠٪، مفيش إعادة» كانت هتبقى كدبة على ورقة ممكن تطلع كاملة.
    if (finished.length > 0 && finished.every((a) => a.state === 'pending_review')) return 'grading';
    const phase = examPhase(facts.openFrom, facts.openUntil, now);
    if (phase === 'upcoming') return 'upcoming';
    if (phase === 'closed') return 'spent';
    if (!decideNextSitting(facts.allowsImprovement, facts.attempts).allowed) return 'spent';
    return finished.length === 0 ? 'new' : 'retake';
  })();

  return { state, bestPercent, full };
}

/** اللي يتعمل دلوقتي الأول — نفس ترتيب `RANK_NEXT_QUIZ_STATES`. */
const STATE_ORDER: Record<RankNextQuizState, number> = {
  resume: 0,
  new: 1,
  retake: 2,
  upcoming: 3,
  grading: 4,
  spent: 5,
};

export function isActionable(state: RankNextQuizState): boolean {
  return state === 'resume' || state === 'new' || state === 'retake';
}

/**
 * مكان المحاضرة في الكورس، بنفس ترتيب `PathService` و`LessonGateService`:
 * الكورسات بترتيب الاشتراك، وجوّه الكورس الوحدة ثم المحاضرة.
 */
export interface ReadingOrder {
  courseOrder: number;
  sectionPosition: number;
  sectionId: string;
  lessonPosition: number;
  lessonId: string;
}

export function compareReading(a: ReadingOrder, b: ReadingOrder): number {
  return (
    a.courseOrder - b.courseOrder ||
    a.sectionPosition - b.sectionPosition ||
    cmp(a.sectionId, b.sectionId) ||
    a.lessonPosition - b.lessonPosition ||
    cmp(a.lessonId, b.lessonId)
  );
}

/** الكويزات: الحالة الأول (اللي يتعمل دلوقتي)، وجوّه الحالة بترتيب الكورس. */
export function compareQuizzes(
  a: ReadingOrder & { state: RankNextQuizState },
  b: ReadingOrder & { state: RankNextQuizState },
): number {
  return STATE_ORDER[a.state] - STATE_ORDER[b.state] || compareReading(a, b);
}

/**
 * الواجبات: اللي اترجع يتعمل تاني الأول — المدرّس مستنيه ونقطه على الترابيزة —
 * وبعدين الباقي بترتيب الكورس، من أول محاضرة.
 */
export function compareHomework(
  a: ReadingOrder & { status: 'new' | 'needs_work' },
  b: ReadingOrder & { status: 'new' | 'needs_work' },
): number {
  return Number(b.status === 'needs_work') - Number(a.status === 'needs_work') || compareReading(a, b);
}

/**
 * «امتحان الشهر» في الكارت: الجاي، وآخر نتيجة.
 *
 * - الجاي = مفتوح ولسه يتحل (`resume`/`new`/`retake`) — اللي بيقفل الأول يكسب،
 *   لأن ده اللي الوقت بيجري عليه. لو مفيش، أقرب واحد لسه مافتحش.
 * - آخر نتيجة = آخر امتحان الطالب قعد فيه وخلّصه، بأحدث تسليم.
 *
 * امتحان فاتح وخلّص محاولاته بيطلع «نتيجة»، مش «جاي»: مفيش حاجة تتعمل فيه.
 */
export function pickExams(
  exams: readonly (RankNextExam & { lastSubmittedAt: Date | null })[],
): { next: RankNextExam | null; last: RankNextExam | null } {
  const strip = ({ lastSubmittedAt: _drop, ...exam }: RankNextExam & { lastSubmittedAt: Date | null }) => exam;

  const sittable = exams
    .filter((exam) => exam.phase === 'open' && isActionable(exam.state))
    .sort(
      (a, b) =>
        Number(b.state === 'resume') - Number(a.state === 'resume') ||
        time(a.openUntil, Infinity) - time(b.openUntil, Infinity) ||
        cmp(a.lessonId, b.lessonId),
    );
  const upcoming = exams
    .filter((exam) => exam.phase === 'upcoming')
    .sort((a, b) => time(a.openFrom, Infinity) - time(b.openFrom, Infinity) || cmp(a.lessonId, b.lessonId));
  const next = sittable[0] ?? upcoming[0] ?? null;

  const sat = exams
    .filter((exam) => exam.lastSubmittedAt !== null && exam.lessonId !== next?.lessonId)
    .sort((a, b) => b.lastSubmittedAt!.getTime() - a.lastSubmittedAt!.getTime() || cmp(a.lessonId, b.lessonId));

  return { next: next ? strip(next) : null, last: sat[0] ? strip(sat[0]) : null };
}

function time(iso: string | null, fallback: number): number {
  return iso === null ? fallback : new Date(iso).getTime();
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * لتحت، مش لأقرب رقم: ٩٩٫٩٦ كانت هتتطبع «١٠٠٪» على كويز لسه ناقص ومستني
 * العلامة الكاملة.
 */
function floor1(value: number): number {
  return Math.floor(value * 10) / 10;
}
