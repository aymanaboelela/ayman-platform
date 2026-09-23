import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface GuardianReport {
  homework: { submitted: number; accepted: number; needsWork: number; published: number };
  quizzes: { sat: number; passed: number; failed: number; averagePercent: number | null };
  /** آخر الورق، الأحدث الأول — وفيه اللي عدّى واللي لأ. */
  papers: {
    attemptId: string;
    title: string;
    courseTitle: string;
    scorePercent: number;
    passed: boolean;
    submittedAt: string;
  }[];
}

/** كام ورقة بالكتير على الشاشة. الأب بيبص على الأخير، مش على الأرشيف. */
const PAPER_LIMIT = 12;

/**
 * التقرير اللي ولي الأمر بيشوفه: الواجبات، والامتحانات، والورق.
 *
 * ## ليه خدمة لوحدها مش زيادة على الداشبورد
 *
 * لأن ده **سؤال تاني**. داشبورد الطالب بتجاوب «أعمل إيه دلوقتي» — فيها
 * «كمّل من مكانك» وامتحانات مستنياه. الأب مش بيذاكر؛ هو بيسأل «هو عامل
 * إيه». حشر الاتنين في تجميع واحد كان هيخلّي كل شاشة تحمل نص اللي مش
 * بتعرضه.
 *
 * والأرقام المشتركة (تقدّم الكورسات) لسه بتتقرا من `DashboardService` —
 * مفيش حساب متكرر، الجديد هنا بس هو اللي مكانش موجود.
 */
@Injectable()
export class GuardianReportService {
  constructor(private readonly prisma: PrismaService) {}

  async forStudent(userId: string): Promise<GuardianReport> {
    const [homeworkRows, publishedHomework, attempts] = await Promise.all([
      this.prisma.homeworkSubmission.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),

      /*
       * المقام: الواجبات اللي **نزلت** في الكورسات اللي هو مسجّل فيها.
       *
       * من غيره الرقم كان هيبقى «سلّم ٣» من غير ما حد يعرف تلاتة من كام —
       * والأب مش عارف الكورس فيه كام واجب أصلًا. وبيتقيّد بكورساته هو، لأن
       * واجب على كورس مش مشترك فيه مش واجب فاته.
       */
      this.prisma.lessonHomework.count({
        where: {
          isPublished: true,
          lesson: {
            isPublished: true,
            course: { enrollments: { some: { userId, status: 'active' } } },
          },
        },
      }),

      this.prisma.quizAttempt.findMany({
        where: { userId, state: 'submitted' },
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          scaledScore: true,
          gradeOutOf: true,
          submittedAt: true,
          quiz: {
            select: {
              passPercent: true,
              lesson: { select: { title: true, course: { select: { title: true } } } },
            },
          },
        },
      }),
    ]);

    const byStatus = new Map(homeworkRows.map((row) => [row.status, row._count._all]));
    const submitted = [...byStatus.values()].reduce((sum, n) => sum + n, 0);

    /*
     * النسبة بتتحسب من `scaledScore / gradeOutOf`، مش من عمود جاهز.
     *
     * `gradeOutOf` مش دايمًا ١٠٠ — الورقة ممكن تبقى من ٥٠ — وقراية
     * `scaledScore` على إنها نسبة كانت هتدّي «٤٧٪» على ورقة ٤٧ من ٥٠، يعني
     * راسب على ورقة ممتازة. والأب بيقرا الرقم ده ويحاسب ابنه عليه.
     */
    const scored = attempts.flatMap((attempt) => {
      const out = Number(attempt.gradeOutOf);
      if (!Number.isFinite(out) || out <= 0 || attempt.scaledScore === null) return [];
      const percent = (Number(attempt.scaledScore) / out) * 100;
      return [
        {
          attemptId: attempt.id,
          title: attempt.quiz?.lesson?.title ?? '—',
          courseTitle: attempt.quiz?.lesson?.course?.title ?? '—',
          scorePercent: Math.round(percent * 10) / 10,
          passed: percent >= Number(attempt.quiz?.passPercent ?? 70),
          submittedAt: (attempt.submittedAt ?? new Date()).toISOString(),
        },
      ];
    });

    const passed = scored.filter((paper) => paper.passed).length;

    return {
      homework: {
        submitted,
        accepted: byStatus.get('accepted') ?? 0,
        needsWork: byStatus.get('needs_work') ?? 0,
        published: publishedHomework,
      },
      quizzes: {
        sat: scored.length,
        passed,
        failed: scored.length - passed,
        // `null` مش صفر: طالب ماامتحنش لسه مالوش متوسط، وصفر بيقرا «امتحن
        // وجاب صفر» — وهي جملة تانية خالص قدام أب.
        averagePercent:
          scored.length === 0
            ? null
            : Math.round(
                (scored.reduce((sum, paper) => sum + paper.scorePercent, 0) / scored.length) * 10,
              ) / 10,
      },
      papers: scored.slice(0, PAPER_LIMIT),
    };
  }
}
