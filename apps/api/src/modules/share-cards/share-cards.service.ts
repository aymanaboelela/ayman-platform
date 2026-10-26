import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CERTIFICATE_MIN_PERCENT,
  type CertificatesPayload,
  type ResultCardPayload,
} from '@ayman/contracts/share-cards';
import { PrismaService } from '../../prisma/prisma.service';
import { AttemptService } from '../quiz/attempt.service';
import { buildCertificates, isExamLesson, percentOf, type AttemptRow, type QuizLessonRow } from './certificates';

/**
 * The data behind «كارت النتيجة» and «شهاداتي». The images themselves are
 * drawn in the browser; this decides who gets one and what it says.
 */
@Injectable()
export class ShareCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: AttemptService,
  ) {}

  /**
   * A result card, only for a mark that will not move.
   *
   * Goes through `AttemptService.review` rather than reading the attempt
   * directly, so the card inherits every rule the review screen already
   * enforces: ownership, a revoked enrolment or unpublished lesson (404), and
   * the review window — a card must not print a score the review page is
   * still withholding. Then two more of its own: no essay still with the
   * teacher, and a score that exists.
   *
   * `examCertificate` rides along so the review page can offer the exam
   * certificate in the same breath as the card, without a second round trip.
   */
  async resultCard(userId: string, attemptId: string): Promise<ResultCardPayload> {
    const review = await this.attempts.review(userId, attemptId);
    if (review.locked || review.scaledScore === null || review.pendingOutOf > 0) throw new NotFoundException();

    const [attempt, studentName] = await Promise.all([
      this.prisma.quizAttempt.findFirst({
        where: { id: attemptId, userId },
        select: {
          submittedAt: true,
          quiz: {
            select: {
              lesson: {
                select: {
                  id: true,
                  title: true,
                  courseId: true,
                  sectionId: true,
                  position: true,
                  section: { select: { title: true, position: true } },
                  course: { select: { id: true, slug: true, title: true, examLessonId: true } },
                },
              },
            },
          },
        },
      }),
      this.studentName(userId),
    ]);
    if (!attempt?.submittedAt) throw new NotFoundException();

    const { lesson } = attempt.quiz;
    const isExam = isExamLesson(
      {
        id: lesson.id,
        title: lesson.title,
        courseId: lesson.courseId,
        sectionId: lesson.sectionId,
        sectionTitle: lesson.section.title,
        sectionPosition: lesson.section.position,
      },
      lesson.course,
    );

    return {
      studentName,
      examTitle: lesson.title,
      courseTitle: lesson.course.title,
      score: review.scaledScore,
      total: review.gradeOutOf,
      examCertificate: isExam && percentOf(review.scaledScore, review.gradeOutOf) >= CERTIFICATE_MIN_PERCENT,
      submittedAt: attempt.submittedAt.toISOString(),
    };
  }

  /**
   * Every unit of every course the student is in — earned or on the way — and
   * every exam certificate earned. See `certificates.ts` for the rules.
   *
   * Three reads, each bounded by the student: their enrolments, the quiz
   * lessons of those courses, and their own final attempts on those lessons.
   */
  async certificates(userId: string): Promise<CertificatesPayload> {
    const enrolments = await this.prisma.enrollment.findMany({
      where: { userId, status: { in: ['active', 'completed'] }, course: { status: 'published' } },
      orderBy: { enrolledAt: 'asc' },
      select: { course: { select: { id: true, slug: true, title: true, examLessonId: true } } },
    });
    const courses = enrolments.map((row) => row.course);
    const courseIds = courses.map((course) => course.id);

    const [lessonRows, studentName] = await Promise.all([
      courseIds.length === 0
        ? Promise.resolve([])
        : this.prisma.lesson.findMany({
            where: {
              courseId: { in: courseIds },
              kind: 'quiz',
              isPublished: true,
              section: { isPublished: true },
              quiz: { isPublished: true },
            },
            orderBy: [{ position: 'asc' }],
            select: {
              id: true,
              title: true,
              courseId: true,
              sectionId: true,
              section: { select: { title: true, position: true } },
            },
          }),
      this.studentName(userId),
    ]);

    const lessons: QuizLessonRow[] = lessonRows.map((row) => ({
      id: row.id,
      title: row.title,
      courseId: row.courseId,
      sectionId: row.sectionId,
      sectionTitle: row.section.title,
      sectionPosition: row.section.position,
    }));

    const attemptRows =
      lessons.length === 0
        ? []
        : await this.prisma.quizAttempt.findMany({
            where: {
              userId,
              // `submitted` only: `pending_review` still has an essay with the
              // teacher, and a mark that will move earns nothing yet.
              state: 'submitted',
              scaledScore: { not: null },
              submittedAt: { not: null },
              quiz: { lessonId: { in: lessons.map((lesson) => lesson.id) } },
            },
            select: { scaledScore: true, gradeOutOf: true, submittedAt: true, quiz: { select: { lessonId: true } } },
          });

    const attempts: AttemptRow[] = attemptRows.map((row) => ({
      lessonId: row.quiz.lessonId,
      score: Number(row.scaledScore),
      total: Number(row.gradeOutOf),
      submittedAt: row.submittedAt!,
    }));

    return {
      studentName,
      minPercent: CERTIFICATE_MIN_PERCENT,
      ...buildCertificates(courses, lessons, attempts),
    };
  }

  /**
   * The full name from onboarding (three parts, NOT NULL), falling back to
   * the account name for a student who has not finished it. A certificate is
   * the one place a first name alone looks wrong.
   */
  private async studentName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, studentProfile: { select: { fullName: true } } },
    });
    return user?.studentProfile?.fullName?.trim() || user?.name?.trim() || '';
  }
}
