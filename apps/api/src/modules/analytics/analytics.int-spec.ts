import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  AnalyticsOverviewSchema,
  LessonAnalyticsDetailSchema,
  LessonAnalyticsRowSchema,
  StudentAnalyticsDetailSchema,
  StudentAnalyticsRowSchema,
} from '@ayman/contracts/admin/analytics';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonAnalyticsService } from './lesson-analytics.service';
import { OverviewService } from './overview.service';
import { StudentAnalyticsService } from './student-analytics.service';

/**
 * The contract test for a module that is almost entirely hand-written SQL.
 *
 * `authorization-matrix.int-spec.ts` already proves every statement PARSES and
 * returns 200. This file proves something the matrix cannot: that what comes
 * back actually satisfies the Zod schema the web app parses it with. A column
 * that returns `numeric` where the schema says `number`, a `bigint` from a
 * `count(*)` missing its `::int`, a rate that rounds to 1.0000000000000002 —
 * every one of those is a 200 here and a 500 on the admin screen, because the
 * parse happens at the web edge.
 *
 * Seeded with a real cohort rather than run against whatever the dev database
 * happens to hold: the interesting rows are the empty ones (a student who
 * never opened the lesson, an attempt with no score) and an incidental
 * database has none of them.
 */
describe('analytics (integration)', () => {
  let prisma: PrismaService;
  let overview: OverviewService;
  let lessons: LessonAnalyticsService;
  let students: StudentAnalyticsService;

  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let governorateCode: string;
  let courseId: string;
  let lessonId: string;
  let quizId: string;
  let liveSessionId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    overview = new OverviewService(prisma);
    lessons = new LessonAnalyticsService(prisma);
    students = new StudentAnalyticsService(prisma);

    const governorate = await prisma.governorate.findFirstOrThrow();
    governorateCode = governorate.code;
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const author = await prisma.user.create({
      data: { id: `an-author-${suffix}`, name: 'Analytics Author', email: `author-${suffix}@t.test`, role: 'admin' },
    });

    const course = await prisma.course.create({
      data: {
        title: `Analytics Course ${suffix}`,
        slug: `analytics-course-${suffix}`,
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: author.id,
      },
    });
    courseId = course.id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 1, isPublished: true },
    });
    const lesson = await prisma.lesson.create({
      data: { courseId, sectionId: section.id, title: 'الدرس', kind: 'video', position: 1, isPublished: true },
    });
    lessonId = lesson.id;
    await prisma.lessonVideo.create({
      data: { lessonId, provider: 'youtube', externalId: 'abcdefghijk', durationSeconds: 600 },
    });

    const quiz = await prisma.quiz.create({
      data: { lessonId, gradeOutOf: 20, passPercent: 50, reviewOptions: {}, isPublished: true },
    });
    quizId = quiz.id;

    // Four students spanning every shape the screens have to render:
    // watched+passed, watched+failed, watched only, and enrolled-but-absent.
    const shapes = [
      { watched: 540, completion: 0.9, state: 'completed' as const, score: 18, passed: true, minutes: 12 },
      { watched: 300, completion: 0.5, state: 'in_progress' as const, score: 6, passed: false, minutes: 3 },
      { watched: 120, completion: 0.2, state: 'in_progress' as const, score: null, passed: null, minutes: null },
      { watched: 0, completion: 0, state: null, score: null, passed: null, minutes: null },
    ];

    for (const [index, shape] of shapes.entries()) {
      const id = `an-student-${suffix}-${index}`;
      userIds.push(id);
      await prisma.user.create({
        data: { id, name: `Student ${index}`, email: `${id}@t.test`, role: 'student' },
      });
      await prisma.studentProfile.create({
        data: {
          userId: id,
          fullName: `طالب ${index}`,
          gender: 'male',
          phone: `0100000${String(index)}${suffix.slice(0, 3)}`,
          governorateCode: governorate.code,
          year: 2,
          onboardingCompletedAt: new Date(),
        },
      });
      const enrollment = await prisma.enrollment.create({ data: { userId: id, courseId } });

      if (shape.state !== null) {
        await prisma.lessonProgress.create({
          data: {
            enrollmentId: enrollment.id,
            lessonId,
            completion: shape.completion,
            state: shape.state,
            watchedSeconds: shape.watched,
            maxPositionSeconds: shape.watched,
            openCount: 1,
            firstOpenedAt: new Date(),
            lastHeartbeatAt: new Date(),
          },
        });
        await prisma.lessonViewSession.create({
          data: {
            enrollmentId: enrollment.id,
            lessonId,
            startedAt: new Date(),
            lastSeenAt: new Date(),
            watchedSeconds: shape.watched,
          },
        });
      }

      if (shape.minutes !== null) {
        const startedAt = new Date(Date.now() - shape.minutes * 60_000);
        await prisma.quizAttempt.create({
          data: {
            quizId,
            userId: id,
            attemptNo: 1,
            state: 'submitted',
            startedAt,
            submittedAt: new Date(),
            rawScore: shape.score,
            scaledScore: shape.score,
            passed: shape.passed,
            sumMarks: 20,
            gradeOutOf: 20,
            passPercent: 50,
          },
        });
      }
    }

    /*
     * The INSTRUCTOR, enrolled in his own course and using it: he opens the
     * lesson, watches half of it, and sits the quiz to check the paper.
     *
     * A real thing every instructor does, and it used to land him in his own
     * students' numbers — inside `eligible` (so every rate on the overview
     * divided by one person too many), inside `watchers`, inside the grade
     * bands, and as a row on the lesson roster he was supposed to be reading.
     * He has no `student_profiles` row and his role is `admin`, so the shared
     * `studentJoins` is what keeps him out. Without it every count in the two
     * tests below is one higher.
     */
    const staff = await prisma.enrollment.create({ data: { userId: author.id, courseId } });
    await prisma.lessonProgress.create({
      data: {
        enrollmentId: staff.id,
        lessonId,
        completion: 0.5,
        state: 'in_progress',
        watchedSeconds: 300,
        maxPositionSeconds: 300,
        openCount: 1,
        firstOpenedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
    });
    await prisma.lessonViewSession.create({
      data: {
        enrollmentId: staff.id,
        lessonId,
        startedAt: new Date(),
        lastSeenAt: new Date(),
        watchedSeconds: 300,
      },
    });
    await prisma.quizAttempt.create({
      data: {
        quizId,
        userId: author.id,
        attemptNo: 1,
        state: 'submitted',
        startedAt: new Date(Date.now() - 60_000),
        submittedAt: new Date(),
        rawScore: 20,
        scaledScore: 20,
        passed: true,
        sumMarks: 20,
        gradeOutOf: 20,
        passPercent: 50,
      },
    });

    /*
     * Two logins for student 0, which is the shape the devices block has to
     * survive: one live session (so the LEFT JOIN onto `sessions` yields a
     * real `lastActiveAt`) and one revoked device whose `Session` row is gone
     * (so the same join yields NULL and `revoked` is true).
     *
     * `session_devices.session_id` is a plain column, not an FK, so the
     * revoked row is allowed to point at a session that does not exist —
     * which is precisely the production state a revoke leaves behind, and the
     * one an `include:`-based implementation could not have reproduced.
     */
    liveSessionId = `an-sess-${suffix}-live`;
    await prisma.session.create({
      data: {
        id: liveSessionId,
        userId: userIds[0]!,
        token: `an-token-${suffix}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.sessionDevice.createMany({
      data: [
        {
          userId: userIds[0]!,
          sessionId: liveSessionId,
          deviceName: 'Chrome على macOS',
          deviceType: 'desktop',
          lastSeenAt: new Date(),
          loggedInAt: new Date(Date.now() - 3_600_000),
        },
        {
          userId: userIds[0]!,
          sessionId: `an-sess-${suffix}-dead`,
          deviceName: 'Safari على iOS',
          deviceType: 'mobile',
          lastSeenAt: new Date(Date.now() - 172_800_000),
          loggedInAt: new Date(Date.now() - 172_800_000),
          revokedAt: new Date(Date.now() - 86_400_000),
        },
      ],
    });
  });

  afterAll(async () => {
    // Course before author: `courses.instructor_id` is a RESTRICT FK, so
    // deleting the users first fails and leaves the whole fixture behind.
    // Everything else (sections, lessons, progress, attempts, sessions and
    // session_devices) cascades off the users.
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [...userIds, `an-author-${suffix}`] } } });
    await prisma.$disconnect();
  });

  it('returns an overview that satisfies the wire contract', async () => {
    const result = await overview.build({ days: 30, courseId });
    expect(() => AnalyticsOverviewSchema.parse(result)).not.toThrow();
  });

  it('leaves the instructor out of the numbers about his own students', async () => {
    // He is enrolled in the course, he watched the lesson and he sat the quiz
    // — every join that reaches a person had to be told he is not one of them.
    const result = await overview.build({ days: 30, courseId });

    expect(result.students.total).toBe(4);
    expect(result.students.enrolled).toBe(4);
    expect(result.video.eligible).toBe(4);
    expect(result.video.watchers).toBe(3);
    expect(result.quiz.participants).toBe(2);
    // The donut is part-to-whole: its slices have to add to `eligible`, which
    // they cannot if one of the people in the denominator is not a student.
    expect(result.engagement.reduce((sum, slice) => sum + slice.n, 0)).toBe(4);
  });

  it('counts a student who has enrolled in nothing — «إجمالي الطلبة» is not «المشتركين»', async () => {
    // The bug, in one assertion: `total` required an active enrollment, so the
    // headline read lower than the denominator printed under the meters and
    // lower than the roster the tile links to. Measured as a delta because the
    // unfiltered build sees whatever else the database holds.
    const before = await overview.build({ days: 30, courseId: null });

    const id = `an-lurker-${suffix}`;
    await prisma.user.create({
      data: { id, name: 'Lurker', email: `${id}@t.test`, role: 'student' },
    });
    await prisma.studentProfile.create({
      data: {
        userId: id,
        fullName: 'طالب سجّل ومشتركش',
        gender: 'female',
        phone: `0109${suffix}`,
        governorateCode,
        year: 2,
        onboardingCompletedAt: new Date(),
      },
    });

    try {
      const after = await overview.build({ days: 30, courseId: null });
      expect(after.students.total).toBe(before.students.total + 1);
      expect(after.students.enrolled).toBe(before.students.enrolled);
    } finally {
      await prisma.user.delete({ where: { id } });
    }
  });

  it('counts the four eligible students and the three who watched', async () => {
    const result = await overview.build({ days: 30, courseId });
    expect(result.video.eligible).toBe(4);
    expect(result.video.watchers).toBe(3);
    expect(result.video.watchRate).toBeCloseTo(0.75, 5);
    // The one enrolled student who never opened anything is the whole reason
    // the denominator is `eligible` and not "students with progress rows".
    expect(result.engagement.find((slice) => slice.segment === 'neither')?.n).toBe(1);
  });

  it('scales scores against grade_out_of rather than reporting raw marks', async () => {
    const result = await overview.build({ days: 30, courseId });
    // 18/20 and 6/20 → mean 0.6, median 0.6.
    expect(result.quiz.meanScore).toBeCloseTo(0.6, 5);
    expect(result.quiz.attempts).toBe(2);
    expect(result.quiz.passRate).toBeCloseTo(0.5, 5);
  });

  it('bands the two graded attempts as one A and one F', async () => {
    const result = await overview.build({ days: 30, courseId });
    const bands = Object.fromEntries(result.gradeBands.map((row) => [row.band, row.n]));
    expect(bands).toMatchObject({ a: 1, b: 0, c: 0, d: 0, f: 1 });
  });

  it('emits one daily point per day with no holes', async () => {
    const result = await overview.build({ days: 30, courseId });
    expect(result.daily).toHaveLength(31);

    /*
     * The WINDOW carries the watch time, not specifically its last bucket.
     *
     * This asserted `daily.at(-1)` — "today" — and the seed writes its
     * heartbeats at `new Date()`. Those are the same day right up until the
     * suite runs across midnight UTC, at which point the seed landed on
     * yesterday, `build()` computed a window ending today, and the last bucket
     * was legitimately empty. It failed exactly that way on run 31917814322 at
     * 00:42 UTC, on a branch that touches nothing in analytics.
     *
     * What the test is actually for is that watch time reaches the series at
     * all, with a point per day and no holes. Summing says that without
     * depending on which side of midnight the clock is on.
     */
    const watched = result.daily.reduce((total, point) => total + point.watchMinutes, 0);
    expect(watched).toBeGreaterThan(0);
  });

  // The bug this pins, in the exact shape the module's own header describes:
  // a 1 a.m. Cairo revision session must count towards THAT day.
  //
  // It reproduced only between 00:00 and 03:00 UTC, which is why it read as a
  // flaky test rather than as the daily chart being wrong every night. Two
  // separate mistakes had to line up: the SQL ran `AT TIME ZONE 'Africa/Cairo'`
  // against a `timestamp WITHOUT time zone`, which INTERPRETS rather than
  // converts, and `dayKeys` generated the key list in UTC. Locally the session
  // timezone hid the first one entirely.
  //
  // Seeding at a FIXED Cairo wall-clock time rather than at `new Date()` is
  // what makes this deterministic at every hour of the day.
  it('counts a 1 a.m. Cairo session on that Cairo day, not the one before', async () => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // 01:00 in Cairo today. `+03:00` is Egypt's summer offset; the assertion
    // below reads the Cairo date back out of the same instant, so it holds
    // either way.
    const oneAm = new Date(`${today}T01:00:00+03:00`);
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { courseId } });
    await prisma.lessonViewSession.create({
      data: {
        enrollmentId: enrollment.id,
        lessonId,
        startedAt: oneAm,
        lastSeenAt: oneAm,
        watchedSeconds: 600,
      },
    });

    const result = await overview.build({ days: 30, courseId });
    const point = result.daily.find((day) => day.date === today);
    expect(point).toBeDefined();
    expect(point!.watchMinutes).toBeGreaterThanOrEqual(10);
    // And it is the LAST point — «today» is the column the dashboard draws at
    // the right-hand edge, and it read zero for three hours every night.
    expect(result.daily.at(-1)?.date).toBe(today);
  });

  it('returns a lesson row that satisfies the wire contract', async () => {
    const [row] = await lessons.list(courseId);
    expect(row).toBeDefined();
    expect(() => LessonAnalyticsRowSchema.parse(row)).not.toThrow();
    expect(row?.eligible).toBe(4);
    expect(row?.opened).toBe(3);
    expect(row?.quizAttempts).toBe(2);
    expect(row?.hasVideo).toBe(true);
  });

  it('lists EVERY eligible student on the lesson roster, absentees included', async () => {
    const detail = await lessons.detail(lessonId);
    expect(() => LessonAnalyticsDetailSchema.parse(detail)).not.toThrow();
    expect(detail.students).toHaveLength(4);
    const absent = detail.students.find((student) => student.watchedSeconds === 0);
    expect(absent).toBeDefined();
    // `null`, not 0 — never sat it is a different fact from scored zero.
    expect(absent?.bestScore).toBeNull();
    expect(absent?.attempts).toBe(0);
  });

  it('returns a student roster row and a detail that satisfy the wire contract', async () => {
    const { rows, rowCount } = await students.list({
      page: 1,
      perPage: 25,
      q: `طالب`,
      sort: 'meanScore',
      dir: 'desc',
      year: [],
      courseId,
    });
    expect(rowCount).toBeGreaterThanOrEqual(4);
    for (const row of rows) expect(() => StudentAnalyticsRowSchema.parse(row)).not.toThrow();

    const detail = await students.detail(userIds[0]!);
    expect(() => StudentAnalyticsDetailSchema.parse(detail)).not.toThrow();
    expect(detail.summary.meanScore).toBeCloseTo(0.9, 5);
    expect(detail.attempts).toHaveLength(1);
    expect(detail.attempts[0]?.seconds).toBeGreaterThan(0);
  });

  it('lists the lessons the student opened, with the per-lesson watch record', async () => {
    const detail = await students.detail(userIds[0]!);

    expect(detail.lessons).toHaveLength(1);
    const [lesson] = detail.lessons;
    expect(lesson?.lessonId).toBe(lessonId);
    expect(lesson?.courseId).toBe(courseId);
    expect(lesson?.courseTitle).toBe(`Analytics Course ${suffix}`);
    expect(lesson?.state).toBe('completed');
    expect(lesson?.watchedSeconds).toBe(540);
    expect(lesson?.openCount).toBe(1);
    // The `::float` cast plus `clampFraction` — a Decimal reaching the wire
    // unconverted is a 500 at the web edge, not a wrong number here.
    expect(lesson?.completion).toBeCloseTo(0.9, 5);
    expect(typeof lesson?.lastSeenAt).toBe('string');
  });

  it('omits lessons the student never opened', async () => {
    // Student 3 is enrolled and has no `lesson_progress` row at all. The
    // `open_count > 0` predicate is what keeps a 200-lesson course from
    // contributing 200 untouched rows to a record that means "what he did".
    const detail = await students.detail(userIds[3]!);
    expect(detail.lessons).toEqual([]);
  });

  it('reports the devices the account signs in from, live session and revoked alike', async () => {
    const detail = await students.detail(userIds[0]!);
    const { devices } = detail;

    expect(devices.logins).toBe(2);
    expect(devices.distinctDevices).toBe(2);
    expect(devices.clearedByBan).toBe(false);
    expect(devices.byType).toEqual(
      expect.arrayContaining([
        { type: 'desktop', logins: 1, devices: 1 },
        { type: 'mobile', logins: 1, devices: 1 },
      ]),
    );

    // Newest login first, so `lastLoginAt` is the head row's.
    const [live, revoked] = devices.recent;
    expect(live?.deviceType).toBe('desktop');
    expect(live?.revoked).toBe(false);
    expect(devices.lastLoginAt).toBe(live?.loggedInAt);
    // The LEFT JOIN onto `sessions` is the whole point: this is the session's
    // own rolling `updated_at`, NOT `session_devices.last_seen_at`, which is
    // written once at insert and would just repeat the login.
    expect(typeof live?.lastActiveAt).toBe('string');

    expect(revoked?.deviceType).toBe('mobile');
    expect(revoked?.revoked).toBe(true);
    // Its `Session` row never existed, and a plain column has no FK to force
    // one — so the join produces null rather than dropping the row.
    expect(revoked?.lastActiveAt).toBeNull();
  });

  it('distinguishes an empty device log from one a ban erased — and keeps saying so after the unban', async () => {
    /*
     * Two empty lists that mean opposite things. Student 1 simply has no
     * device rows; a banned student has none because `StudentsService.ban`
     * DELETES them. Rendering both the same way states something false about
     * one of them.
     *
     * The flag is keyed on the BAN AUDIT ROW, not on `users.banned_at`, and
     * this test is why. `unban` clears `banned_at` and cannot restore the
     * deleted rows — so a flag reading the live column flips back to "this
     * account simply has no devices" while the history stays erased, which is
     * the exact sentence the flag exists to prevent. An admin who bans by
     * mistake and immediately undoes it hits this within seconds.
     */
    const id = userIds[1]!;

    const clean = await students.detail(id);
    expect(clean.devices.recent).toEqual([]);
    expect(clean.devices.logins).toBe(0);
    expect(clean.devices.clearedByBan).toBe(false);

    /*
     * NOT cleaned up in a `finally`, and that is the table working as designed:
     * `audit_log` is INSERT-only for the runtime role (the REVOKE lives in its
     * migration), so a `deleteMany` here is a `42501 permission denied` — which
     * is exactly what CI reported the first time this test was written. The row
     * is orphaned rather than dangling: `resource_id` is a plain string with no
     * foreign key, and the fixture's ids carry a per-run random suffix, so
     * nothing later reads it.
     */
    await prisma.auditLog.create({
      data: {
        action: 'student:ban',
        resourceType: 'user',
        resourceId: id,
        outcome: 'success',
        // The chain hash is `AuditService`'s business; this row exists only to
        // be found by the EXISTS lookup, which reads none of it.
        hash: '0'.repeat(64),
      },
    });

    const banned = await students.detail(id);
    expect(banned.devices.recent).toEqual([]);
    expect(banned.devices.clearedByBan).toBe(true);

    // The regression: lifting the ban must not turn the erased history back
    // into «this account never had any».
    await prisma.user.update({ where: { id }, data: { bannedAt: null, bannedReason: null } });
    const unbanned = await students.detail(id);
    expect(unbanned.devices.clearedByBan).toBe(true);
  });

  it('counts every sign-in even when the recent list is capped', async () => {
    /*
     * The bug this guards is the ordinary case, not an exotic one. A row is
     * written per SIGN-IN, so a student who opens the app each morning crosses
     * the display cap within a term. Counting the fetched page in JS made the
     * headline freeze at the cap — «٥٠» forever — and quietly redefined the
     * type split as "the last fifty logins" rather than the student's habits.
     */
    const id = userIds[2]!;
    const overCap = 60;
    await prisma.sessionDevice.createMany({
      data: Array.from({ length: overCap }, (_, index) => ({
        userId: id,
        sessionId: `an-sess-${suffix}-bulk-${index}`,
        // Two names, so `distinctDevices` cannot be mistaken for a row count.
        deviceName: index % 2 === 0 ? 'Chrome على Android' : 'Chrome على Windows',
        deviceType: index % 2 === 0 ? 'mobile' : 'desktop',
        lastSeenAt: new Date(Date.now() - index * 60_000),
        loggedInAt: new Date(Date.now() - index * 60_000),
      })),
    });

    try {
      const { devices } = await students.detail(id);
      expect(devices.logins).toBe(overCap);
      expect(devices.distinctDevices).toBe(2);
      expect(devices.byType).toEqual(
        expect.arrayContaining([
          { type: 'mobile', logins: 30, devices: 1 },
          { type: 'desktop', logins: 30, devices: 1 },
        ]),
      );
      // The list itself stays bounded — that cap is fine, it is only the
      // totals that may never be derived from it.
      expect(devices.recent.length).toBeLessThan(overCap);
      expect(devices.recent.length).toBeGreaterThan(0);
    } finally {
      await prisma.sessionDevice.deleteMany({ where: { userId: id } });
    }
  });

  it('keeps the live session id addressable for the join it depends on', async () => {
    // Guards the one assumption the devices query cannot express in types:
    // `session_devices.session_id` matches `sessions.id`. If a future change
    // renames either column the join silently returns null for every row and
    // «آخر نشاط» quietly becomes «—» on every student.
    const device = await prisma.sessionDevice.findUnique({
      where: { sessionId: liveSessionId },
    });
    expect(device?.userId).toBe(userIds[0]);
  });

  it('keeps every rate inside 0..1 when a participant is no longer enrolled', async () => {
    // The case that produced a 500 on the real dashboard: a student sits the
    // quiz, their enrollment is later revoked, and the numerator now counts
    // someone `eligible` does not. The contract's `max(1)` catches it at the
    // web edge, which is a whole page down over one revoked enrolment.
    const id = userIds[0]!;
    await prisma.enrollment.updateMany({
      where: { userId: id, courseId },
      data: { status: 'revoked' },
    });
    try {
      const [row] = await lessons.list(courseId);
      expect(row).toBeDefined();
      expect(row!.eligible).toBe(3);
      expect(row!.quizParticipationRate).toBeLessThanOrEqual(1);
      expect(row!.openRate).toBeLessThanOrEqual(1);
      expect(() => LessonAnalyticsRowSchema.parse(row)).not.toThrow();

      const overviewResult = await overview.build({ days: 30, courseId });
      expect(() => AnalyticsOverviewSchema.parse(overviewResult)).not.toThrow();
      expect(overviewResult.quiz.participationRate).toBeLessThanOrEqual(1);
      expect(overviewResult.video.watchRate).toBeLessThanOrEqual(1);
    } finally {
      await prisma.enrollment.updateMany({
        where: { userId: id, courseId },
        data: { status: 'active' },
      });
    }
  });

  it('sorts by a mapped column and puts NULL scores last in both directions', async () => {
    const descending = await students.list({
      page: 1, perPage: 25, q: `طالب`, sort: 'meanScore', dir: 'desc', year: [], courseId,
    });
    const ascending = await students.list({
      page: 1, perPage: 25, q: `طالب`, sort: 'meanScore', dir: 'asc', year: [], courseId,
    });
    expect(descending.rows[0]?.meanScore).toBeCloseTo(0.9, 5);
    expect(ascending.rows[0]?.meanScore).toBeCloseTo(0.3, 5);
    expect(descending.rows.at(-1)?.meanScore).toBeNull();
    expect(ascending.rows.at(-1)?.meanScore).toBeNull();
  });
});
