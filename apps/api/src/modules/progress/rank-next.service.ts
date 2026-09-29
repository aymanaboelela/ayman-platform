import { Injectable } from '@nestjs/common';
import { EXAM_SHELF_TITLE, examPhase } from '@ayman/contracts/quiz/scheduled';
import { isMonthlyExamLesson } from '@ayman/contracts/quiz/monthly-exam';
import {
  RANK_NEXT_MAX_ITEMS,
  type RankNextExam,
  type RankNextHomework,
  type RankNextQuiz,
  type RankNextSteps,
} from '@ayman/contracts/rank-next';
import { isFeatureEnabled } from '../../common/entitlements';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { LessonAccessService } from './lesson-access.service';
import {
  classifyQuiz,
  compareHomework,
  compareQuizzes,
  isActionable,
  pickExams,
  type NextAttempt,
  type ReadingOrder,
} from './rank-next';

/**
 * كام محاضرة بتتعدّى على البوابة في كل كارت، على الأكتر.
 *
 * كل واحدة قراية للمحاضرة نفسها (الباقي بيتسأل مرة للكورس — `openable`)،
 * فالسقف ده هو اللي بيخلّي طالب قاعد سنة ومش حالل حاجة مايكلّفش الصفحة ميت
 * قراية. أربعين أكتر من اللي أي كارت بيعرضه (`RANK_NEXT_MAX_ITEMS`)، واللي
 * فوقهم بيبان في الرقم بس لو اتعدّى.
 */
const VERIFY_CAP = 40;

interface Candidate extends ReadingOrder {
  courseId: string;
  courseSlug: string;
  courseTitle: string;
}

/**
 * «الطريق لفوق» — الحاجات اللي ناقصة الطالب، كل واحدة بباب.
 *
 * تلات قوايم، كل واحدة من استعلام واحد على كورسات الطالب نفسه:
 *
 *   · الواجبات المنشورة اللي ماتسلّمتش (أو اترجعت `needs_work`).
 *   · الكويزات اللي لسه ماخدش فيها العلامة الكاملة — نفس تعريف «كويز» في
 *     `CohortRankService`: مش على رف «امتحانات الشهر» ومش امتحان الكورس.
 *   · امتحانات الشهر (`isMonthlyExamLesson`).
 *
 * وبعدين كل محاضرة فيهم بتعدّي على `LessonAccessService.openable` — يعني
 * `require()` نفسه — قبل ما تبقى صف. فالصف اللي بيطلع هنا الطالب يقدر يفتحه
 * دلوقتي، والمقفول باشتراك بيتعدّ في `locked` بباب واحد.
 *
 * لايف، من غير كاش: الطالب اللي لسه مسلّم واجب وراجع يشوف الكارت لازم يلاقيه
 * اتشال.
 */
@Injectable()
export class RankNextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
  ) {}

  async forUser(userId: string): Promise<RankNextSteps> {
    const now = new Date();
    const homeworkOn = isFeatureEnabled('homework');
    const examsOn = isFeatureEnabled('exams');

    // نفس ترتيب `PathService`: أول كورس اشترك فيه الأول.
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        userId,
        status: { in: [...ACTIVE_ENROLLMENT_STATUSES] },
        course: { status: 'published' },
      },
      orderBy: [{ enrolledAt: 'asc' }, { id: 'asc' }],
      select: { courseId: true },
    });
    const courseOrder = new Map(enrollments.map((row, index) => [row.courseId, index]));
    const courseIds = [...courseOrder.keys()];

    if (courseIds.length === 0) {
      return {
        homework: homeworkOn ? { items: [], total: 0, locked: null } : null,
        quizzes: { items: [], total: 0, actionable: 0, locked: null },
        exams: examsOn ? { next: null, last: null } : null,
      };
    }

    /*
     * المحاضرة لازم تكون منشورة ووحدتها منشورة — نفس اللي `LessonGateService`
     * بيرسم منه المسار. `require()` كان هيرفض الباقي كده كده، بس الفلتر هنا
     * بيوفّر عليه القراية.
     */
    const visible = { courseId: { in: courseIds }, isPublished: true, section: { isPublished: true } };

    const [homeworkRows, quizRows] = await Promise.all([
      homeworkOn
        ? this.prisma.lesson.findMany({
            where: {
              ...visible,
              homework: { is: { isPublished: true } },
              // `needs_work` بيفضل ظاهر: اتسلّم، بس ناقصه لحد ٦٠ نقطة لما يتقبل.
              homeworkSubmissions: { none: { userId, status: { in: ['submitted', 'accepted'] } } },
            },
            select: {
              id: true,
              title: true,
              position: true,
              courseId: true,
              section: { select: { id: true, position: true } },
              course: { select: { slug: true, title: true } },
              homeworkSubmissions: { where: { userId }, select: { status: true }, take: 1 },
            },
          })
        : Promise.resolve([]),
      this.prisma.quiz.findMany({
        where: { isPublished: true, lesson: visible },
        select: {
          id: true,
          openFrom: true,
          openUntil: true,
          allowsImprovement: true,
          lesson: {
            select: {
              id: true,
              title: true,
              kind: true,
              position: true,
              courseId: true,
              section: { select: { id: true, position: true, title: true } },
              course: { select: { slug: true, title: true, examLessonId: true } },
            },
          },
        },
      }),
    ]);

    const attempts = quizRows.length
      ? await this.prisma.quizAttempt.findMany({
          where: { userId, quizId: { in: quizRows.map((quiz) => quiz.id) } },
          select: {
            quizId: true,
            attemptNo: true,
            paper: true,
            state: true,
            extraAttempts: true,
            scaledScore: true,
            gradeOutOf: true,
            submittedAt: true,
          },
        })
      : [];
    const attemptsByQuiz = new Map<string, NextAttempt[]>();
    for (const row of attempts) {
      const list = attemptsByQuiz.get(row.quizId) ?? [];
      list.push({
        attemptNo: row.attemptNo,
        paper: row.paper,
        state: row.state,
        extraAttempts: row.extraAttempts,
        scaledScore: row.scaledScore === null ? null : Number(row.scaledScore),
        gradeOutOf: Number(row.gradeOutOf),
        submittedAt: row.submittedAt,
      });
      attemptsByQuiz.set(row.quizId, list);
    }

    const place = (lesson: {
      id: string;
      title: string;
      position: number;
      courseId: string;
      section: { id: string; position: number };
      course: { slug: string; title: string };
    }): Candidate => ({
      courseId: lesson.courseId,
      courseSlug: lesson.course.slug,
      courseTitle: lesson.course.title,
      courseOrder: courseOrder.get(lesson.courseId) ?? Number.MAX_SAFE_INTEGER,
      sectionPosition: lesson.section.position,
      sectionId: lesson.section.id,
      lessonPosition: lesson.position,
      lessonId: lesson.id,
    });

    const homework = homeworkRows
      .map((lesson) => ({
        ...place(lesson),
        lessonTitle: lesson.title,
        status: lesson.homeworkSubmissions[0]?.status === 'needs_work' ? ('needs_work' as const) : ('new' as const),
      }))
      .sort(compareHomework)
      .slice(0, VERIFY_CAP);

    const quizzes: Array<Candidate & RankNextQuiz> = [];
    const exams: Array<Candidate & RankNextExam & { lastSubmittedAt: Date | null }> = [];
    for (const quiz of quizRows) {
      const lesson = quiz.lesson;
      const facts = {
        allowsImprovement: quiz.allowsImprovement,
        openFrom: quiz.openFrom,
        openUntil: quiz.openUntil,
        attempts: attemptsByQuiz.get(quiz.id) ?? [],
      };
      const verdict = classifyQuiz(facts, now);

      if (isMonthlyExamLesson(lesson.kind, lesson.section.title)) {
        if (!examsOn) continue;
        const submitted = facts.attempts
          .map((a) => a.submittedAt)
          .filter((at): at is Date => at !== null)
          .sort((a, b) => b.getTime() - a.getTime());
        exams.push({
          ...place(lesson),
          title: lesson.title,
          phase: examPhase(quiz.openFrom, quiz.openUntil, now),
          openFrom: quiz.openFrom?.toISOString() ?? null,
          openUntil: quiz.openUntil?.toISOString() ?? null,
          state: verdict.state,
          bestPercent: verdict.bestPercent,
          lastSubmittedAt: submitted[0] ?? null,
        });
        continue;
      }

      // «كويز» في النقط = مش على رف الامتحانات ومش امتحان الكورس
      // (`CohortRankService.scores` → `is_exam`). نفس التعريف هنا، وإلا الكارت
      // هيعرض حاجة نقطها بتتحسب بالضعف تحت عنوان «الكويز».
      if (lesson.section.title === EXAM_SHELF_TITLE || lesson.id === lesson.course.examLessonId) continue;
      if (verdict.full) continue;
      quizzes.push({ ...place(lesson), title: lesson.title, state: verdict.state, bestPercent: verdict.bestPercent });
    }
    quizzes.sort(compareQuizzes);
    const quizzesToCheck = quizzes.slice(0, VERIFY_CAP);

    const verdicts = await this.access.openable(userId, [
      ...homework.map((row) => row.lessonId),
      ...quizzesToCheck.map((row) => row.lessonId),
      ...exams.map((row) => row.lessonId),
    ]);
    const isOpen = (row: { lessonId: string }) => verdicts.get(row.lessonId) === 'open';

    const openHomework = homework.filter(isOpen);
    const openQuizzes = quizzesToCheck.filter(isOpen);

    return {
      homework: homeworkOn
        ? {
            items: openHomework.slice(0, RANK_NEXT_MAX_ITEMS).map(toHomework),
            total: openHomework.length,
            locked: lockedOf(homework, verdicts),
          }
        : null,
      quizzes: {
        items: openQuizzes.slice(0, RANK_NEXT_MAX_ITEMS).map(toQuiz),
        total: openQuizzes.length,
        actionable: openQuizzes.filter((row) => isActionable(row.state)).length,
        locked: lockedOf(quizzesToCheck, verdicts),
      },
      exams: examsOn ? pickExams(exams.filter(isOpen).map(toExam)) : null,
    };
  }
}

/**
 * المقفول باشتراك: كام واحد، وكورس أولهم عشان الباب (`/library/:slug`). اللي
 * البوابة قالت عليه 404 (منشور غلط، امتحان الكورس لسه بدري) مابيتعدّش: مفيش
 * حاجة تتشرى عشان تفتحه.
 */
function lockedOf(
  rows: readonly Candidate[],
  verdicts: ReadonlyMap<string, 'open' | 'locked' | 'hidden'>,
): { count: number; courseSlug: string } | null {
  const locked = rows.filter((row) => verdicts.get(row.lessonId) === 'locked');
  return locked.length > 0 ? { count: locked.length, courseSlug: locked[0]!.courseSlug } : null;
}

function toHomework(row: Candidate & { lessonTitle: string; status: RankNextHomework['status'] }): RankNextHomework {
  return {
    lessonId: row.lessonId,
    lessonTitle: row.lessonTitle,
    courseSlug: row.courseSlug,
    courseTitle: row.courseTitle,
    status: row.status,
  };
}

function toQuiz(row: Candidate & RankNextQuiz): RankNextQuiz {
  return {
    lessonId: row.lessonId,
    title: row.title,
    courseSlug: row.courseSlug,
    courseTitle: row.courseTitle,
    state: row.state,
    bestPercent: row.bestPercent,
  };
}

function toExam(
  row: Candidate & RankNextExam & { lastSubmittedAt: Date | null },
): RankNextExam & { lastSubmittedAt: Date | null } {
  return {
    lessonId: row.lessonId,
    title: row.title,
    courseSlug: row.courseSlug,
    courseTitle: row.courseTitle,
    phase: row.phase,
    openFrom: row.openFrom,
    openUntil: row.openUntil,
    state: row.state,
    bestPercent: row.bestPercent,
    lastSubmittedAt: row.lastSubmittedAt,
  };
}
