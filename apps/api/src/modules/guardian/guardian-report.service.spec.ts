// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { GuardianViewSchema, type GuardianView } from '@ayman/contracts/guardian-view';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CentersService } from '../centers/centers.service';
import { BacklogService } from '../dashboard/backlog.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { PathService } from '../dashboard/path.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { MistakesGateService } from '../mistakes/mistakes-gate.service';
import { MistakesService } from '../mistakes/mistakes.service';
import { CohortRankService } from '../progress/cohort-rank.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { QuestionBankService } from '../quiz/question-bank.service';
import { QuizScoreFeed } from '../quiz/quiz-score-feed';
import { ShareCardsService } from '../share-cards/share-cards.service';
import { GuardianReportService } from './guardian-report.service';

/**
 * The parent's page against REAL rows — every number on it pinned to a
 * fixture whose answer was worked out by hand (see the table in each `it`),
 * and every block cross-checked against the screen the student reads the same
 * fact from. A number that agrees with the fixture but not with the student's
 * own screen is still wrong: the conversation at home is about the difference.
 *
 * The fixture, one student («سارة») in three courses:
 *
 *   A «كورس البرمجة» — bought, live to +60 days.
 *     L1 watched 2 days ago, homework ACCEPTED (90)
 *     L2 watched 20 days ago, homework NEEDS WORK
 *     L3 not opened, homework never handed in (MISSING)
 *     L4 half-watched an hour ago, homework handed in yesterday (WAITING)
 *     L5 unpublished — counts nowhere
 *     Q1 quiz: sat twice (50 ✗, then 90 ✓ on a granted retake)
 *     EX the course exam: 45 of 50 ✓
 *     M1 «امتحان الشهر» on its shelf: essay still with the teacher
 *   B «كورس الفيزياء» — the grant EXPIRED yesterday; the enrollment row still
 *     says `active`, as it always does. LB1 watched, LB2 never opened (and no
 *     longer can be); QB quiz 12/20 ✗.
 *   C «كورس الرياضة» — sells by month; holds «شهر ١» only. LC1 (month 1)
 *     watched 3 days ago; LC2 (month 2) not theirs and must not count.
 *
 * A second student sat Q1 and handed in L3's homework — none of it may reach
 * the first student's page.
 */
describe('GuardianReportService — the whole page over real rows', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const entitlement = new EntitlementService(prisma);
  const gate = new LessonGateService(prisma, entitlement);
  const dashboard = new DashboardService(prisma, new QuizScoreFeed(prisma), gate);
  const path = new PathService(prisma, gate);
  const backlog = new BacklogService(prisma, path);
  const rank = new CohortRankService(prisma);
  const mistakes = new MistakesService(prisma);
  const report = new GuardianReportService(
    prisma,
    dashboard,
    path,
    backlog,
    rank,
    new ShareCardsService(prisma, {} as never),
    mistakes,
    new MistakesGateService(prisma),
    new CentersService(prisma, new AuditService(prisma)),
  );

  const stamp = Date.now();
  const studentId = `gr-student-${stamp}`;
  const otherId = `gr-other-${stamp}`;
  const adminId = `gr-admin-${stamp}`;
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);
  const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000);

  const ids = {
    courses: [] as string[],
    attempts: [] as string[],
    bankEntries: [] as string[],
    categoryId: '',
    centerId: '',
  };
  const lesson: Record<string, string> = {};
  let systemId = '';
  let view: GuardianView;

  async function makeCourse(title: string, extra: { examLessonId?: string } = {}) {
    const subject = await prisma.subject.findFirstOrThrow();
    const course = await prisma.course.create({
      data: {
        slug: `gr-${randomUUID()}`,
        title,
        status: 'published',
        publishedAt: new Date(),
        systemId,
        year: 2,
        subjectId: subject.id,
        instructorId: adminId,
        requiresGrant: true,
        ...extra,
      },
    });
    ids.courses.push(course.id);
    return course;
  }

  async function makeLesson(
    key: string,
    courseId: string,
    sectionId: string,
    position: number,
    kind: 'video' | 'quiz' = 'video',
    isPublished = true,
  ) {
    const row = await prisma.lesson.create({
      data: { courseId, sectionId, title: key, kind, position, isPublished },
    });
    lesson[key] = row.id;
    return row.id;
  }

  async function makeQuiz(lessonId: string, gradeOutOf: number, passPercent = 70) {
    return prisma.quiz.create({
      data: {
        lessonId,
        reviewOptions: DEFAULT_REVIEW_OPTIONS,
        sumMarks: 20,
        gradeOutOf,
        passPercent,
        isPublished: true,
      },
    });
  }

  async function sit(args: {
    quizId: string;
    userId?: string;
    attemptNo?: number;
    state?: 'submitted' | 'pending_review';
    scaled: number;
    outOf: number;
    passed: boolean;
    at: Date;
  }) {
    const id = randomUUID();
    ids.attempts.push(id);
    await prisma.quizAttempt.create({
      data: {
        id,
        quizId: args.quizId,
        userId: args.userId ?? studentId,
        attemptNo: args.attemptNo ?? 1,
        paper: 'original',
        state: args.state ?? 'submitted',
        startedAt: args.at,
        submittedAt: args.at,
        scaledScore: args.scaled,
        rawScore: args.scaled,
        gradeOutOf: args.outOf,
        sumMarks: 20,
        passPercent: 70,
        passed: args.passed,
        // A granted retake is what lets the same paper be sat twice.
        extraAttempts: (args.attemptNo ?? 1) > 1 ? 1 : 0,
      },
    });
    return id;
  }

  async function progress(enrollmentId: string, lessonId: string, over: Record<string, unknown>) {
    await prisma.lessonProgress.create({ data: { enrollmentId, lessonId, ...over } });
  }

  const done = (at: Date) => ({
    state: 'completed' as const,
    completion: 1,
    completedAt: at,
    completedVia: 'auto' as const,
    firstOpenedAt: at,
    lastHeartbeatAt: at,
  });

  beforeAll(async () => {
    await prisma.$connect();
    const governorate = await prisma.governorate.findFirstOrThrow();
    systemId = (await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } })).id;

    await prisma.user.createMany({
      data: [
        { id: studentId, name: 'سارة', email: `${studentId}@t.test`, role: 'student' },
        { id: otherId, name: 'غيرها', email: `${otherId}@t.test`, role: 'student' },
        { id: adminId, name: 'المدرّس', email: `${adminId}@t.test`, role: 'admin' },
      ],
    });
    await prisma.studentProfile.createMany({
      data: [
        {
          userId: studentId,
          fullName: 'سارة محمد علي',
          gender: 'female',
          phone: `0109${String(stamp).slice(-7)}`,
          governorateCode: governorate.code,
          year: 2,
          systemId,
        },
        {
          userId: otherId,
          fullName: 'طالب تاني',
          gender: 'male',
          phone: `0119${String(stamp).slice(-7)}`,
          governorateCode: governorate.code,
          year: 2,
          systemId,
        },
      ],
    });

    // ── A ──────────────────────────────────────────────────────────────
    const a = await makeCourse('كورس البرمجة');
    const unit = await prisma.courseSection.create({
      data: { courseId: a.id, title: 'الوحدة الأولى', position: 1, isPublished: true },
    });
    const shelf = await prisma.courseSection.create({
      data: { courseId: a.id, title: EXAM_SHELF_TITLE, position: 9, isPublished: true },
    });
    for (const [i, key] of ['L1', 'L2', 'L3', 'L4'].entries()) await makeLesson(key, a.id, unit.id, i + 1);
    await makeLesson('L5', a.id, unit.id, 5, 'video', false);
    await makeLesson('Q1', a.id, unit.id, 6, 'quiz');
    await makeLesson('EX', a.id, unit.id, 7, 'quiz');
    await makeLesson('M1', a.id, shelf.id, 1, 'quiz');
    await prisma.course.update({ where: { id: a.id }, data: { examLessonId: lesson.EX } });

    const q1 = await makeQuiz(lesson.Q1!, 100);
    const ex = await makeQuiz(lesson.EX!, 50);
    const m1 = await makeQuiz(lesson.M1!, 60);

    for (const key of ['L1', 'L2', 'L3', 'L4']) {
      await prisma.lessonHomework.create({ data: { lessonId: lesson[key]!, body: 'حل التمارين', isPublished: true } });
    }

    const [enrolA, otherEnrolA] = await Promise.all([
      prisma.enrollment.create({ data: { userId: studentId, courseId: a.id, progressPercent: 50 } }),
      prisma.enrollment.create({ data: { userId: otherId, courseId: a.id } }),
    ]);
    await prisma.accessGrant.createMany({
      data: [
        { userId: studentId, scope: 'course', courseId: a.id, source: 'purchase', validFrom: daysAgo(90), validUntil: daysAgo(-60) },
        { userId: otherId, scope: 'course', courseId: a.id, source: 'purchase', validFrom: daysAgo(90) },
      ],
    });

    await progress(enrolA.id, lesson.L1!, done(daysAgo(2)));
    await progress(enrolA.id, lesson.L2!, done(daysAgo(20)));
    await progress(enrolA.id, lesson.L4!, {
      state: 'in_progress',
      completion: 0.5,
      firstOpenedAt: daysAgo(1),
      lastHeartbeatAt: hoursAgo(1),
    });
    // The quiz lecture's own row — what the engine writes when Q1 is passed.
    await progress(enrolA.id, lesson.Q1!, { ...done(daysAgo(40)), state: 'passed' });
    // The other student's watching must not move this student's numbers.
    await progress(otherEnrolA.id, lesson.L3!, done(hoursAgo(2)));

    await prisma.homeworkSubmission.createMany({
      data: [
        { lessonId: lesson.L1!, userId: studentId, courseId: a.id, status: 'accepted', grade: 90, submittedAt: daysAgo(10), reviewedAt: daysAgo(9) },
        { lessonId: lesson.L2!, userId: studentId, courseId: a.id, status: 'needs_work', submittedAt: daysAgo(15), reviewedAt: daysAgo(14) },
        { lessonId: lesson.L4!, userId: studentId, courseId: a.id, status: 'submitted', submittedAt: daysAgo(1) },
        { lessonId: lesson.L3!, userId: otherId, courseId: a.id, status: 'accepted', submittedAt: hoursAgo(3), reviewedAt: hoursAgo(2) },
      ],
    });

    const q1First = await sit({ quizId: q1.id, attemptNo: 1, scaled: 50, outOf: 100, passed: false, at: daysAgo(45) });
    await sit({ quizId: q1.id, attemptNo: 2, scaled: 90, outOf: 100, passed: true, at: daysAgo(40) });
    await sit({ quizId: ex.id, scaled: 45, outOf: 50, passed: true, at: daysAgo(26) });
    const pendingId = await sit({
      quizId: m1.id,
      state: 'pending_review',
      scaled: 30,
      outOf: 60,
      passed: false,
      at: daysAgo(3),
    });
    await sit({ quizId: q1.id, userId: otherId, scaled: 100, outOf: 100, passed: true, at: hoursAgo(5) });

    // One MCQ the student got wrong on Q1's first sitting (the mistakes
    // notebook), and one essay on M1 still on the teacher's desk.
    const bank = new QuestionBankService(prisma, new AuditService(prisma));
    const category = await prisma.questionCategory.create({ data: { name: `gr-${stamp}` } });
    ids.categoryId = category.id;
    const mcq = await bank.create(
      {
        type: 'mcq_single',
        categoryId: category.id,
        stemHtml: '<p>سؤال</p>',
        defaultMark: 1,
        settings: { shuffleOptions: false, caseSensitive: false },
        options: [
          { bodyHtml: '<p>أ</p>', fraction: 1 },
          { bodyHtml: '<p>ب</p>', fraction: 0 },
        ],
      } as QuestionInput,
      adminId,
    );
    await bank.publish(mcq.versionId);
    ids.bankEntries.push(mcq.bankEntryId);
    const essay = await bank.create(
      { type: 'essay', categoryId: category.id, stemHtml: '<p>اشرح</p>', defaultMark: 1, settings: {}, options: [] } as QuestionInput,
      adminId,
    );
    await bank.publish(essay.versionId);
    ids.bankEntries.push(essay.bankEntryId);
    await prisma.attemptQuestion.createMany({
      data: [
        {
          attemptId: q1First,
          slotPosition: 1,
          questionVersionId: mcq.versionId,
          optionOrder: [0, 1],
          maxMark: 1,
          minFraction: 0,
          maxFraction: 1,
          mark: 0,
          fraction: 0,
          state: 'graded_wrong',
          gradedAt: daysAgo(45),
          answeredAt: daysAgo(45),
        },
        {
          attemptId: pendingId,
          slotPosition: 1,
          questionVersionId: essay.versionId,
          optionOrder: [],
          maxMark: 10,
          minFraction: 0,
          maxFraction: 1,
          state: 'needs_grading',
          answeredAt: daysAgo(3),
        },
      ],
    });

    // ── B ──────────────────────────────────────────────────────────────
    const b = await makeCourse('كورس الفيزياء');
    const unitB = await prisma.courseSection.create({
      data: { courseId: b.id, title: 'الوحدة', position: 1, isPublished: true },
    });
    await makeLesson('LB1', b.id, unitB.id, 1);
    // Never opened — and the subscription is gone, so it will not open.
    await makeLesson('LB2', b.id, unitB.id, 2);
    await makeLesson('QB', b.id, unitB.id, 3, 'quiz');
    const qb = await makeQuiz(lesson.QB!, 20);
    const enrolB = await prisma.enrollment.create({ data: { userId: studentId, courseId: b.id, progressPercent: 50 } });
    await prisma.accessGrant.create({
      data: { userId: studentId, scope: 'course', courseId: b.id, source: 'purchase', validFrom: daysAgo(120), validUntil: daysAgo(1) },
    });
    await progress(enrolB.id, lesson.LB1!, done(daysAgo(30)));
    await progress(enrolB.id, lesson.QB!, { ...done(daysAgo(30)), state: 'failed', completedAt: null, completedVia: null, completion: 0 });
    await sit({ quizId: qb.id, scaled: 12, outOf: 20, passed: false, at: daysAgo(30) });

    // ── C ──────────────────────────────────────────────────────────────
    const c = await makeCourse('كورس الرياضة');
    const unitC = await prisma.courseSection.create({
      data: { courseId: c.id, title: 'الوحدة', position: 1, isPublished: true },
    });
    await makeLesson('LC1', c.id, unitC.id, 1);
    await makeLesson('LC2', c.id, unitC.id, 2);
    const [month1, month2] = await Promise.all([
      prisma.courseMonth.create({ data: { courseId: c.id, monthIndex: 1, title: 'شهر ١' } }),
      prisma.courseMonth.create({ data: { courseId: c.id, monthIndex: 2, title: 'شهر ٢' } }),
    ]);
    await prisma.lessonMonth.createMany({
      data: [
        { lessonId: lesson.LC1!, monthId: month1.id, courseId: c.id, isPrimary: true },
        { lessonId: lesson.LC2!, monthId: month2.id, courseId: c.id, isPrimary: true },
      ],
    });
    const enrolC = await prisma.enrollment.create({ data: { userId: studentId, courseId: c.id, progressPercent: 100 } });
    await prisma.accessGrant.create({
      data: { userId: studentId, scope: 'course_month', courseId: c.id, monthId: month1.id, source: 'purchase', validFrom: daysAgo(10) },
    });
    await progress(enrolC.id, lesson.LC1!, done(daysAgo(3)));

    // ── the centre ─────────────────────────────────────────────────────
    const center = await prisma.center.create({ data: { name: 'سنتر النور' } });
    ids.centerId = center.id;
    const slot = await prisma.centerSlot.create({
      data: { centerId: center.id, dayOfWeek: 6, startMinute: 16 * 60, endMinute: 18 * 60, year: 2 },
    });
    await prisma.centerBooking.create({ data: { slotId: slot.id, userId: studentId, createdAt: daysAgo(60) } });
    const [present, missed] = await Promise.all([
      prisma.attendanceSession.create({ data: { slotId: slot.id, date: daysAgo(14) } }),
      prisma.attendanceSession.create({ data: { slotId: slot.id, date: daysAgo(7) } }),
    ]);
    await prisma.attendanceRecord.create({ data: { sessionId: present.id, userId: studentId, scannedAt: daysAgo(14) } });
    void missed;

    await prisma.honorBoardPin.create({
      data: { userId: studentId, rank: 1, reason: 'الأولى في امتحان الشهر', honoredAt: daysAgo(2), courseId: a.id },
    });

    rank.clearCache();
    view = await report.forStudent({
      userId: studentId,
      fullName: 'سارة محمد علي',
      year: 2,
      systemId,
      trackLabel: null,
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.attemptQuestion.deleteMany({ where: { attemptId: { in: ids.attempts } } });
    await prisma.quizAttempt.deleteMany({ where: { id: { in: ids.attempts } } });
    await prisma.homeworkSubmission.deleteMany({ where: { userId: { in: [studentId, otherId] } } });
    await prisma.honorBoardPin.deleteMany({ where: { userId: studentId } });
    await prisma.attendanceRecord.deleteMany({ where: { userId: studentId } });
    await prisma.centerBooking.deleteMany({ where: { userId: studentId } });
    if (ids.centerId) {
      await prisma.attendanceSession.deleteMany({ where: { slot: { centerId: ids.centerId } } });
      await prisma.centerSlot.deleteMany({ where: { centerId: ids.centerId } });
      await prisma.center.deleteMany({ where: { id: ids.centerId } });
    }
    await prisma.accessGrant.deleteMany({ where: { userId: { in: [studentId, otherId] } } });
    await prisma.course.updateMany({ where: { id: { in: ids.courses } }, data: { examLessonId: null } });
    await prisma.course.deleteMany({ where: { id: { in: ids.courses } } });
    await prisma.studentProfile.deleteMany({ where: { userId: { in: [studentId, otherId] } } });
    // The bank before the users — a question version's author is `Restrict`.
    await prisma.questionBankEntry.deleteMany({ where: { id: { in: ids.bankEntries } } });
    if (ids.categoryId) await prisma.questionCategory.deleteMany({ where: { id: ids.categoryId } });
    // Every user this file made, the admin included — a left-behind admin
    // fans every later spec's notifications out once more (fixture-admins).
    await prisma.user.deleteMany({ where: { id: { in: [studentId, otherId, adminId] } } });
    await prisma.$disconnect();
  });

  it('is exactly the contract the web page parses', () => {
    expect(GuardianViewSchema.parse(view)).toEqual(view);
  });

  it('names the student and the year in the stack’s own words', async () => {
    const label = await prisma.academicYear.findFirst({ where: { year: 2, systemId }, select: { labelAr: true } });
    expect(view.student).toEqual({ name: 'سارة محمد علي', yearLabel: label?.labelAr ?? null, trackLabel: null });
  });

  it('reads each subscription off the grant — the expired one says so, whatever the enrollment row says', () => {
    const byTitle = new Map(view.courses.map((course) => [course.title, course]));
    expect(byTitle.get('كورس البرمجة')!.access).toMatchObject({ state: 'active', plan: 'full', months: [] });
    expect(new Date(byTitle.get('كورس البرمجة')!.access.validUntil!).getTime()).toBeGreaterThan(now);
    expect(byTitle.get('كورس الفيزياء')!.access).toEqual({ state: 'ended', plan: null, months: [], validUntil: null });
    expect(byTitle.get('كورس الرياضة')!.access).toEqual({
      state: 'active',
      plan: 'months',
      months: ['شهر ١'],
      validUntil: null,
    });
  });

  it('counts lectures in the months held — and agrees with the student’s own «كورساتي» to the lecture', async () => {
    const byTitle = new Map(view.courses.map((course) => [course.title, course.lectures]));
    //            watched / published lectures (no quizzes, no unpublished L5, no unheld month)
    expect(byTitle.get('كورس البرمجة')).toEqual({ completed: 2, total: 4, percent: 50 });
    expect(byTitle.get('كورس الفيزياء')).toEqual({ completed: 1, total: 2, percent: 50 });
    expect(byTitle.get('كورس الرياضة')).toEqual({ completed: 1, total: 1, percent: 100 });

    const own = await dashboard.forUser(studentId);
    expect(view.courses.map((course) => [course.id, course.lectures.completed, course.lectures.total])).toEqual(
      own.enrolledCourses.map((course) => [course.id, course.completedLessons, course.totalLessons]),
    );
  });

  it('lists every homework with its real status — and owes exactly what «المتراكم» owes', async () => {
    expect(view.homework).toMatchObject({ accepted: 1, submitted: 1, needsWork: 1, missing: 1 });
    expect(view.homework!.items.map((item) => [item.lessonTitle, item.status, item.grade])).toEqual([
      ['L4', 'submitted', null],
      ['L3', 'missing', null],
      ['L2', 'needs_work', null],
      ['L1', 'accepted', 90],
    ]);

    const own = await backlog.forUser(studentId);
    expect(view.homework!.missing + view.homework!.needsWork).toBe(own.counts.homework);
    expect(view.homework!.submitted).toBe(own.counts.awaitingReview);
    expect(view.backlog).toMatchObject({
      lectures: own.counts.lectures,
      quizzes: own.counts.quizzes,
      homework: own.counts.homework,
    });
    // The same three «المتراكم» lists — LB2 included, as the path draws it.
    expect(view.backlog).toMatchObject({ lectures: 3, quizzes: 0, homework: 2 });
    expect(view.backlog.items.map((item) => [item.title, item.kind])).toEqual([
      ['L3', 'lecture'],
      ['L4', 'lecture'],
      ['LB2', 'lecture'],
    ]);
  });

  it('marks: one row per paper, the better sitting counts, the essay is «being marked» not a zero', () => {
    expect(
      view.quizzes.papers.map((paper) => [paper.title, paper.kind, paper.result?.percent ?? null, paper.result?.passed ?? null, paper.sittings]),
    ).toEqual([
      ['M1', 'monthly', null, null, 1],
      ['EX', 'final', 90, true, 1],
      ['QB', 'quiz', 60, false, 1],
      ['Q1', 'quiz', 90, true, 2],
    ]);
    // 30 marked out of the 30 that were marked; 30 more still with the teacher.
    expect(view.quizzes.papers[0]!.pending).toEqual({ gradedScore: 30, gradedOutOf: 30, pendingOutOf: 30 });
    expect(view.quizzes.papers[1]!.result).toEqual({ score: 45, outOf: 50, percent: 90, passed: true });

    expect(view.quizzes).toMatchObject({
      quizzes: { taken: 2, average: 75 },
      exams: { taken: 1, average: 90 },
      passed: 2,
      failed: 1,
      pending: 1,
    });
    // Only marked sittings draw the line — both of Q1's included.
    expect(view.quizzes.series.map((point) => point.scorePercent)).toEqual([50, 90, 60, 90]);
  });

  it('averages exactly what the student’s «ترتيبي» averages', async () => {
    const own = await rank.forUser(studentId);
    expect(view.quizzes.quizzes.average).toBe(own.me.quizzes.average);
    expect(view.quizzes.exams.average).toBe(own.me.exams.average);
    expect(view.quizzes.pending).toBe(own.me.pendingReview);
    expect(view.rank).toEqual({
      cohortLabel: own.cohort!.label,
      rank: own.me.rank,
      betterThanPercent: own.me.betterThanPercent,
      points: own.me.points,
    });
  });

  it('per course: averages, backlog and the last thing done', () => {
    const a = view.courses.find((course) => course.title === 'كورس البرمجة')!;
    expect(a.quizzes).toEqual({ taken: 1, average: 90 });
    expect(a.exams).toEqual({ taken: 1, average: 90 });
    expect(a.backlog).toEqual({ lectures: 2, quizzes: 0, homework: 2 });
    // L4's heartbeat an hour ago — not the other student's watching two hours ago.
    expect(new Date(a.lastActivityAt!).getTime()).toBe(hoursAgo(1).getTime());
    expect(view.lastActivityAt).toBe(a.lastActivityAt);

    const b = view.courses.find((course) => course.title === 'كورس الفيزياء')!;
    expect(b.quizzes).toEqual({ taken: 1, average: 60 });
    expect(b.backlog).toEqual({ lectures: 1, quizzes: 0, homework: 0 });
  });

  it('the week: «٢ محاضرات من ٤», one paper sat, one homework handed in', () => {
    // L1 (2 days) + LC1 (3 days) done; L3 + L4 still open → 2 of 4. LB2 is
    // NOT waiting: its course's subscription ended, so it cannot be opened.
    expect(view.week).toEqual({ lecturesDone: 2, lecturesOpen: 4, quizzesSat: 1, homeworkHandedIn: 1 });
  });

  it('certificates, the honor board, weak topics and the centre come from their own services', () => {
    expect(view.certificates).toMatchObject({
      units: [{ title: 'الوحدة الأولى', courseTitle: 'كورس البرمجة' }],
      exams: [{ title: 'EX', percent: 90 }],
    });
    expect(view.honorBoard).toMatchObject({ rank: 1, reason: 'الأولى في امتحان الشهر', total: 1 });
    expect(view.weakTopics).toEqual([{ title: 'Q1', courseTitle: 'كورس البرمجة', mistakes: 1 }]);
    expect(view.attendance).toMatchObject({ centerName: 'سنتر النور', attended: 1, absent: 1 });
    expect(view.attendance!.recent.map((entry) => entry.status)).toEqual(['absent', 'present']);
  });

  it('the other student’s page carries only their own rows', async () => {
    const theirs = await report.forStudent({ userId: otherId, fullName: 'طالب تاني', year: 2, systemId, trackLabel: null });
    expect(theirs.quizzes.papers.map((paper) => [paper.title, paper.result?.percent])).toEqual([['Q1', 100]]);
    expect(theirs.homework!.items.find((item) => item.lessonTitle === 'L3')!.status).toBe('accepted');
    expect(theirs.attendance).toBeNull();
    expect(theirs.honorBoard).toBeNull();
    expect(theirs.courses.map((course) => course.title)).toEqual(['كورس البرمجة']);
  });

  it('a brand-new student gets empty blocks — never zeros dressed as results', async () => {
    const freshId = `gr-fresh-${stamp}`;
    await prisma.user.create({ data: { id: freshId, name: 'جديد', email: `${freshId}@t.test`, role: 'student' } });
    try {
      const fresh = await report.forStudent({ userId: freshId, fullName: 'جديد', year: null, systemId: null, trackLabel: null });
      expect(fresh).toMatchObject({
        student: { name: 'جديد', yearLabel: null },
        lastActivityAt: null,
        week: { lecturesDone: 0, lecturesOpen: 0, quizzesSat: 0, homeworkHandedIn: 0 },
        courses: [],
        backlog: { lectures: 0, quizzes: 0, homework: 0, items: [] },
        homework: { accepted: 0, submitted: 0, needsWork: 0, missing: 0, items: [] },
        quizzes: { quizzes: { taken: 0, average: null }, exams: { taken: 0, average: null }, papers: [], series: [] },
        rank: null,
        honorBoard: null,
        weakTopics: [],
        attendance: null,
      });
      expect(GuardianViewSchema.parse(fresh)).toEqual(fresh);
    } finally {
      await prisma.user.delete({ where: { id: freshId } });
    }
  });
});
