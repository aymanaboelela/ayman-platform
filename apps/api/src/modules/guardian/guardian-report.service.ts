import { Injectable, Logger } from '@nestjs/common';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import type { GuardianCourse, GuardianView } from '@ayman/contracts/guardian-view';
import { PrismaService } from '../../prisma/prisma.service';
import { isFeatureEnabled } from '../../common/entitlements';
import { DashboardService } from '../dashboard/dashboard.service';
import { PathService } from '../dashboard/path.service';
import { BacklogService } from '../dashboard/backlog.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { courseAccessScopes } from '../entitlement/grant-liveness';
import { CONTENT_SCOPES } from '../entitlement/content-access';
import { CohortRankService } from '../progress/cohort-rank.service';
import { ShareCardsService } from '../share-cards/share-cards.service';
import { MistakesService } from '../mistakes/mistakes.service';
import { MistakesGateService } from '../mistakes/mistakes-gate.service';
import { CentersService } from '../centers/centers.service';
import { accessFor, type AccessGrantRow } from './guardian-access';
import { foldScores, type SittingRow } from './guardian-scores';

/** The student, as the controller already read them off the session. */
export interface GuardianStudent {
  userId: string;
  fullName: string;
  year: number | null;
  systemId: string | null;
  trackLabel: string | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Sittings read per page. A year of quizzes is ~150; this is a ceiling on a
 *  runaway account, not a page size anyone reaches. */
const SITTING_LIMIT = 500;
/** Rows of «محتاج متابعة» drawn from the backlog — the rest is a count. */
const BACKLOG_ITEM_LIMIT = 6;
const WEAK_TOPIC_LIMIT = 5;
const ATTENDANCE_RECENT = 8;

const latest = (...dates: (Date | null | undefined)[]): Date | null =>
  dates.reduce<Date | null>((max, date) => (date && (max === null || date > max) ? date : max), null);

/**
 * Everything the parent's page shows — see `GuardianViewSchema` for which
 * service each block is read from and why none of them is a second copy.
 *
 * ## Cost
 *
 * One page, opened by a parent every few days, so the budget is "the student's
 * own screens added up", never a scan: every query below is keyed on this
 * student (`userId`, or the student's own enrollment ids), and the only
 * cohort-wide read — the rank — comes out of `CohortRankService`'s five-minute
 * snapshot, the one `/rank` already pays for. Independent reads are issued
 * together; the optional blocks (rank, certificates, weak topics, centre) fail
 * to `null` with a log line instead of taking the page down.
 */
@Injectable()
export class GuardianReportService {
  private readonly logger = new Logger(GuardianReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly path: PathService,
    private readonly backlog: BacklogService,
    private readonly rank: CohortRankService,
    private readonly shareCards: ShareCardsService,
    private readonly mistakes: MistakesService,
    private readonly mistakesGate: MistakesGateService,
    private readonly centers: CentersService,
  ) {}

  async forStudent(student: GuardianStudent): Promise<GuardianView> {
    const { userId } = student;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - WEEK_MS);

    // Optional blocks — started first, awaited last; each owns its catch.
    const rank = this.optional('rank', () => this.rankFor(userId));
    const certificates = isFeatureEnabled('shareCards')
      ? this.optional('certificates', () => this.certificatesFor(userId))
      : Promise.resolve(null);
    const weakTopics = this.optional('weak topics', () => this.weakTopicsFor(userId));
    const attendance = this.optional('attendance', () => this.attendanceFor(userId));
    const yearLabel = this.optional('year label', () => this.yearLabelFor(student));

    const [dashboard, path, enrollments, sittings, homeworkThisWeek, lastHomework] = await Promise.all([
      this.dashboard.forUser(userId),
      this.path.forUser(userId),
      this.prisma.enrollment.findMany({
        // The same rows «كورساتي» lists: active or completed, not retired.
        where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] }, course: { status: { not: 'archived' } } },
        select: { id: true, course: { select: { id: true, subjectId: true, requiresGrant: true } } },
      }),
      this.sittingsFor(userId),
      this.prisma.homeworkSubmission.count({ where: { userId, submittedAt: { gte: weekAgo } } }),
      this.prisma.homeworkSubmission.findFirst({
        where: { userId },
        orderBy: { submittedAt: 'desc' },
        select: { submittedAt: true },
      }),
    ]);

    const enrollmentIds = enrollments.map((row) => row.id);
    const courseIds = enrollments.map((row) => row.course.id);

    const [homeworkRows, grants, activity, lecturesDoneThisWeek] = await Promise.all([
      this.backlog.homeworkFromPath(userId, path),
      courseIds.length === 0
        ? Promise.resolve([] as AccessGrantRow[])
        : this.prisma.accessGrant.findMany({
            where: {
              userId,
              OR: [
                ...enrollments.flatMap((row) => courseAccessScopes(row.course)),
                { courseId: { in: courseIds }, scope: { in: [...CONTENT_SCOPES] } },
              ],
            },
            select: {
              id: true,
              scope: true,
              courseId: true,
              subjectId: true,
              monthId: true,
              validFrom: true,
              validUntil: true,
              revokedAt: true,
            },
          }),
      enrollmentIds.length === 0
        ? Promise.resolve([])
        : this.prisma.lessonProgress.groupBy({
            by: ['enrollmentId'],
            where: { enrollmentId: { in: enrollmentIds } },
            _max: { lastHeartbeatAt: true, completedAt: true, firstOpenedAt: true },
          }),
      enrollmentIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.lessonProgress.count({
            where: {
              enrollmentId: { in: enrollmentIds },
              state: { in: ['completed', 'passed'] },
              completedAt: { gte: weekAgo },
              // Lectures, the unit «٣ من ٤» counts in — a quiz is the
              // lecture's check, never a row of its own (same as «كورساتي»).
              lesson: { kind: { not: 'quiz' } },
            },
          }),
    ]);

    // «شهر ١، شهر ٢» — the titles of the months held, in curriculum order.
    const monthIds = [
      ...new Set(grants.flatMap((grant) => (grant.scope === 'course_month' && grant.monthId ? [grant.monthId] : []))),
    ];
    const months =
      monthIds.length === 0
        ? []
        : await this.prisma.courseMonth.findMany({
            where: { id: { in: monthIds } },
            select: { id: true, title: true, monthIndex: true },
          });
    const monthTitles = new Map(months.map((month) => [month.id, { title: month.title, index: month.monthIndex }]));

    const backlog = await this.backlog.fromPath(userId, path, homeworkRows);
    const scores = foldScores(sittings);

    const courseOfEnrollment = new Map(enrollments.map((row) => [row.id, row.course]));
    const subjectOf = new Map(enrollments.map((row) => [row.course.id, row.course]));
    const activityByCourse = new Map<string, Date | null>();
    for (const row of activity) {
      const course = courseOfEnrollment.get(row.enrollmentId);
      if (!course) continue;
      activityByCourse.set(
        course.id,
        latest(row._max.lastHeartbeatAt, row._max.completedAt, row._max.firstOpenedAt),
      );
    }
    for (const sitting of sittings) {
      activityByCourse.set(sitting.courseId, latest(activityByCourse.get(sitting.courseId), sitting.submittedAt));
    }
    for (const row of homeworkRows) {
      activityByCourse.set(row.courseId, latest(activityByCourse.get(row.courseId), row.submittedAt));
    }

    const backlogByCourse = new Map(
      backlog.courses.map((course) => [
        course.id,
        {
          lectures: course.items.filter((item) => item.kind === 'lecture').length,
          quizzes: course.items.filter((item) => item.kind === 'quiz' || item.kind === 'exam').length,
          homework: course.items.filter((item) => item.kind === 'homework').length,
        },
      ]),
    );

    const courses: GuardianCourse[] = dashboard.enrolledCourses.map((course) => {
      const subject = subjectOf.get(course.id) ?? { id: course.id, subjectId: '', requiresGrant: true };
      const marks = scores.byCourse.get(course.id);
      return {
        id: course.id,
        title: course.title,
        subjectNameAr: course.subjectNameAr,
        coverKey: course.coverKey,
        published: course.published,
        access: accessFor(subject, grants, monthTitles, now),
        lectures: {
          completed: course.completedLessons,
          total: course.totalLessons,
          percent: Math.min(100, Math.max(0, course.progressPercent)),
        },
        backlog: backlogByCourse.get(course.id) ?? { lectures: 0, quizzes: 0, homework: 0 },
        quizzes: marks?.quizzes ?? { taken: 0, average: null },
        exams: marks?.exams ?? { taken: 0, average: null },
        lastActivityAt: activityByCourse.get(course.id)?.toISOString() ?? null,
      };
    });

    const homework = isFeatureEnabled('homework')
      ? {
          accepted: homeworkRows.filter((row) => row.status === 'accepted').length,
          submitted: homeworkRows.filter((row) => row.status === 'submitted').length,
          needsWork: homeworkRows.filter((row) => row.status === 'needs_work').length,
          missing: homeworkRows.filter((row) => row.status === 'missing').length,
          // Newest lecture first — the parent reads from the top down.
          items: [...homeworkRows].reverse().map((row) => ({
            lessonId: row.lessonId,
            lessonTitle: row.title,
            courseId: row.courseId,
            courseTitle: row.courseTitle,
            status: row.status,
            submittedAt: row.submittedAt?.toISOString() ?? null,
            grade: row.grade,
          })),
        }
      : null;

    const quizzesThisWeek = new Set(
      sittings.filter((sitting) => sitting.submittedAt >= weekAgo).map((sitting) => sitting.lessonId),
    ).size;

    const lastActivity = latest(
      ...activityByCourse.values(),
      sittings[0]?.submittedAt,
      lastHomework?.submittedAt,
    );

    return {
      student: { name: student.fullName, yearLabel: await yearLabel, trackLabel: student.trackLabel },
      lastActivityAt: lastActivity?.toISOString() ?? null,
      week: {
        lecturesDone: lecturesDoneThisWeek,
        lecturesOpen: lecturesDoneThisWeek + backlog.counts.lectures,
        quizzesSat: quizzesThisWeek,
        homeworkHandedIn: homeworkThisWeek,
      },
      courses,
      backlog: {
        lectures: backlog.counts.lectures,
        quizzes: backlog.counts.quizzes,
        homework: backlog.counts.homework,
        items: backlog.courses
          .flatMap((course) =>
            course.items
              .filter((item) => item.kind !== 'homework')
              .map((item) => ({
                courseId: course.id,
                courseTitle: course.title,
                kind: item.kind as 'lecture' | 'quiz' | 'exam',
                title: item.title,
              })),
          )
          .slice(0, BACKLOG_ITEM_LIMIT),
      },
      homework,
      quizzes: {
        quizzes: scores.quizzes,
        exams: scores.exams,
        passed: scores.passed,
        failed: scores.failed,
        pending: scores.pending,
        series: scores.series,
        papers: scores.papers,
      },
      rank: await rank,
      honorBoard: isFeatureEnabled('honorBoard') ? dashboard.honorBoard : null,
      certificates: await certificates,
      weakTopics: await weakTopics,
      attendance: await attendance,
    };
  }

  /**
   * Every sitting that reached the teacher, newest first, tagged with what
   * kind of paper it was.
   *
   * «امتحان الشهر» has no column of its own: it is any quiz on the
   * `EXAM_SHELF_TITLE` shelf, and the course exam is `courses.exam_lesson_id`
   * — the same two tests `CohortRankService`'s `typed` CTE runs.
   */
  private async sittingsFor(userId: string): Promise<SittingRow[]> {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { userId, state: { in: ['submitted', 'pending_review'] }, submittedAt: { not: null } },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: SITTING_LIMIT,
      select: {
        id: true,
        attemptNo: true,
        state: true,
        submittedAt: true,
        scaledScore: true,
        gradeOutOf: true,
        sumMarks: true,
        passed: true,
        quiz: {
          select: {
            lesson: {
              select: {
                id: true,
                title: true,
                section: { select: { title: true } },
                course: { select: { id: true, title: true, examLessonId: true } },
              },
            },
          },
        },
      },
    });

    const markingIds = attempts.filter((attempt) => attempt.state === 'pending_review').map((attempt) => attempt.id);
    const pendingMarks = new Map<string, number>();
    if (markingIds.length > 0) {
      const grouped = await this.prisma.attemptQuestion.groupBy({
        by: ['attemptId'],
        where: { attemptId: { in: markingIds }, state: 'needs_grading' },
        _sum: { maxMark: true },
      });
      for (const group of grouped) pendingMarks.set(group.attemptId, Number(group._sum.maxMark ?? 0));
    }

    return attempts.map((attempt) => {
      const lesson = attempt.quiz.lesson;
      const kind: SittingRow['kind'] =
        lesson.course.examLessonId === lesson.id ? 'final' : lesson.section.title === EXAM_SHELF_TITLE ? 'monthly' : 'quiz';
      return {
        attemptId: attempt.id,
        attemptNo: attempt.attemptNo,
        lessonId: lesson.id,
        title: lesson.title,
        courseId: lesson.course.id,
        courseTitle: lesson.course.title,
        kind,
        state: attempt.state as SittingRow['state'],
        // Non-null by the WHERE clause; Prisma's type cannot say so.
        submittedAt: attempt.submittedAt as Date,
        scaledScore: attempt.scaledScore === null ? null : Number(attempt.scaledScore),
        gradeOutOf: Number(attempt.gradeOutOf),
        sumMarks: Number(attempt.sumMarks),
        passed: attempt.passed,
        pendingMarks: pendingMarks.get(attempt.id) ?? 0,
      };
    });
  }

  /** The stack's own label for the year — the same lookup the rank's cohort
   *  label uses, so a prep-stage stack says its own words. */
  private async yearLabelFor(student: GuardianStudent): Promise<string | null> {
    if (student.year === null) return null;
    const row = await this.prisma.academicYear.findFirst({
      where: { year: student.year, ...(student.systemId ? { systemId: student.systemId } : {}) },
      orderBy: { system: { sortOrder: 'asc' } },
      select: { labelAr: true },
    });
    return row?.labelAr ?? null;
  }

  /** The student's own place — and nothing of the podium or ladder, which
   *  name other students. */
  private async rankFor(userId: string): Promise<GuardianView['rank']> {
    const standing = await this.rank.forUser(userId);
    if (standing.cohort === null) return null;
    return {
      cohortLabel: standing.cohort.label,
      rank: standing.me.rank,
      betterThanPercent: standing.me.betterThanPercent,
      points: standing.me.points,
    };
  }

  private async certificatesFor(userId: string): Promise<GuardianView['certificates']> {
    const payload = await this.shareCards.certificates(userId);
    return {
      minPercent: payload.minPercent,
      units: payload.units.flatMap((unit) =>
        unit.earned && unit.earnedAt
          ? [{ id: unit.id, title: unit.title, courseTitle: unit.courseTitle, earnedAt: unit.earnedAt }]
          : [],
      ),
      exams: payload.exams.map((exam) => ({
        id: exam.id,
        title: exam.title,
        courseTitle: exam.courseTitle,
        percent: exam.percent,
        earnedAt: exam.earnedAt,
      })),
    };
  }

  /**
   * «محتاج يتراجع» — the lectures with the most questions still open in the
   * student's own mistakes notebook, read through `MistakesService.notebook`
   * so «اتصلحت» means here exactly what it means there. Mistakes from a game
   * on a question tied to no lecture have no topic to name and are left out.
   */
  private async weakTopicsFor(userId: string): Promise<GuardianView['weakTopics']> {
    if (!(await this.mistakesGate.isOpen())) return null;
    const notebook = await this.mistakes.notebook(userId);
    const topics = new Map<string, { title: string; courseTitle: string | null; mistakes: number }>();
    for (const entry of notebook.open) {
      if (!entry.lessonTitle) continue;
      const key = `${entry.courseTitle ?? ''}\u0000${entry.lessonTitle}`;
      const topic = topics.get(key) ?? { title: entry.lessonTitle, courseTitle: entry.courseTitle, mistakes: 0 };
      topic.mistakes += 1;
      topics.set(key, topic);
    }
    return [...topics.values()]
      .sort((a, b) => b.mistakes - a.mistakes || a.title.localeCompare(b.title))
      .slice(0, WEAK_TOPIC_LIMIT);
  }

  /** `null` for a student who has never been booked into a centre — an
   *  online student has no attendance to report, which is not «غاب ٠». */
  private async attendanceFor(userId: string): Promise<GuardianView['attendance']> {
    const record = await this.centers.studentAttendance(userId);
    if (record.booking === null && record.attended + record.absent === 0) return null;
    return {
      centerName: record.booking?.centerName ?? null,
      attended: record.attended,
      absent: record.absent,
      recent: record.entries.slice(0, ATTENDANCE_RECENT).map((entry) => ({
        date: entry.date,
        centerName: entry.centerName,
        status: entry.status,
      })),
    };
  }

  private optional<T>(label: string, read: () => Promise<T>): Promise<T | null> {
    return read().catch((error: unknown) => {
      this.logger.warn(`guardian ${label} block failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
  }
}
