// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { MONTH_DELETE_BLOCKED_CODE, MONTH_OPEN_BLOCKED_CODE } from '@ayman/contracts/admin/content-months';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { CourseMonthService } from './course-month.service';

/**
 * «شهور المنهج» — the admin half. Integration test against the real database,
 * same convention as `term.service.spec.ts` next door: the behaviours under
 * test are what a `groupBy` actually counts, what a RESTRICT foreign key
 * actually refuses, and what a partial unique index actually allows — and a
 * mock proves none of those.
 *
 * The last test is the one that matters most and is not about months at all:
 * a course with NO `course_months` rows must behave exactly as it did before
 * this feature existed. That is the whole backward-compatibility promise, and
 * it is asserted through `LessonAccessService` rather than through a flag,
 * because the flag is not what a student meets.
 */
describe('CourseMonthService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const service = new CourseMonthService(prisma, audit);
  const entitlement = new EntitlementService(prisma);
  const lessonAccess = new LessonAccessService(
    prisma,
    new LessonGateService(prisma, new EntitlementService(prisma)),
    entitlement,
  );

  let instructorId = '';
  let systemId = '';
  let subjectId = '';

  const MISSING_UUID = '00000000-0000-7000-8000-000000000000';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now().toString(36);
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    systemId = system.id;
    const subject = await prisma.subject.findFirstOrThrow();
    subjectId = subject.id;
    const instructor = await prisma.user.create({
      data: { id: `cm-instr-${stamp}`, name: 'مدرس', email: `cm-instr-${stamp}@t.test`, role: 'admin' },
    });
    instructorId = instructor.id;
  });

  afterAll(async () => {
    // Courses cascade to months, `lesson_months` and every grant naming them,
    // so the instructor's courses are the only root that has to be named.
    await prisma.course.deleteMany({ where: { instructorId } });
    await prisma.user.deleteMany({ where: { id: { startsWith: 'cm-stu-' }, email: { endsWith: '@t.test' } } });
    await prisma.user.delete({ where: { id: instructorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  /** A closed, published course with one section — the shape every test starts
   *  from. Lectures are each test's own concern, because "is there a published
   *  lecture with no month" IS the subject of half of them. */
  async function makeCourse(opts: { monthlyPriceCents?: number | null } = {}) {
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const course = await prisma.course.create({
      data: {
        slug: `cm-course-${stamp}`,
        title: 'كورس',
        status: 'published',
        publishedAt: new Date(),
        systemId,
        year: 2,
        subjectId,
        instructorId,
        requiresGrant: true,
        monthlyPriceCents: opts.monthlyPriceCents === undefined ? 20000 : opts.monthlyPriceCents,
      },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'الوحدة', position: 1, isPublished: true },
    });
    return { courseId: course.id, sectionId: section.id };
  }

  async function makeLesson(
    courseId: string,
    sectionId: string,
    opts: { isPublished?: boolean; kind?: 'text' | 'quiz' } = {},
  ) {
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        sectionId,
        title: 'الدرس',
        kind: opts.kind ?? 'text',
        position: Math.floor(Math.random() * 100000),
        isPublished: opts.isPublished ?? true,
        ...(opts.kind === 'quiz' ? {} : { text: { create: { bodyHtml: '<p>محتوى</p>' } } }),
      },
    });
    return lesson.id;
  }

  async function makeStudent() {
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const student = await prisma.user.create({
      data: { id: `cm-stu-${stamp}`, name: 'طالب', email: `cm-stu-${stamp}@t.test` },
    });
    return student.id;
  }

  describe('the untagged guard — the refusal the whole feature rests on', () => {
    it('refuses to open a month while a published lecture carries none, and says how many', async () => {
      const { courseId, sectionId } = await makeCourse();
      await makeLesson(courseId, sectionId);
      await makeLesson(courseId, sectionId);

      const failure = await service
        .create(courseId, { monthIndex: 1, title: 'شهر ١', isOpen: true, startsOn: null })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ConflictException);
      // The COUNT travels in the body — the panel renders
      // `copy.admin.month.blockedByUntagged` with `{n}` and links to them.
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: MONTH_OPEN_BLOCKED_CODE,
        untaggedLessonCount: 2,
      });
      expect(await prisma.courseMonth.count({ where: { courseId } })).toBe(0);
    });

    it('counts a published QUIZ too — the gate does not care what kind it is', async () => {
      /*
       * `resolveMonthAccess` refuses ANY lesson with no month to a month
       * subscriber, quiz included. So a lecture tagged «شهر ١» whose quiz was
       * left untagged is a lecture the student can watch and then cannot sit —
       * and a guard that counted lectures only would have reported the course
       * perfectly tagged while that was true.
       */
      const { courseId, sectionId } = await makeCourse();
      await makeLesson(courseId, sectionId, { kind: 'quiz' });

      const failure = await service
        .create(courseId, { monthIndex: 1, title: 'شهر ١', isOpen: true, startsOn: null })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ConflictException);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        untaggedLessonCount: 1,
      });
    });

    it('does not count a DRAFT — it is not on sale and nobody can meet it', async () => {
      // It is adopted by «حط الكل في الشهر ده» all the same, so that publishing
      // it later does not re-block every month on the course.
      const { courseId, sectionId } = await makeCourse();
      await makeLesson(courseId, sectionId, { isPublished: false });

      const month = await service.create(courseId, {
        monthIndex: 1,
        title: 'شهر ١',
        isOpen: true,
        startsOn: null,
      });
      expect(month.isOpen).toBe(true);
      expect(month.untaggedLessonCount).toBe(0);
    });

    it('lets the month be created CLOSED, so the instructor can tag into it first', async () => {
      const { courseId, sectionId } = await makeCourse();
      const lessonId = await makeLesson(courseId, sectionId);

      const month = await service.create(courseId, {
        monthIndex: 1,
        title: 'شهر ١',
        isOpen: false,
        startsOn: null,
      });
      expect(month.isOpen).toBe(false);
      expect(month.untaggedLessonCount).toBe(1);

      // Opening is still refused while the lecture has no month…
      await expect(service.update(courseId, month.id, { isOpen: true })).rejects.toBeInstanceOf(
        ConflictException,
      );

      // …and allowed the moment it has one.
      await service.setLessonMonths(lessonId, { primaryMonthId: month.id, extraMonthIds: [] });
      const opened = await service.update(courseId, month.id, { isOpen: true });
      expect(opened.isOpen).toBe(true);
      expect(opened.untaggedLessonCount).toBe(0);
    });

    it('does not block a rename of an already-open month that has gone untagged', async () => {
      const { courseId, sectionId } = await makeCourse();
      const month = await service.create(courseId, {
        monthIndex: 2,
        title: 'شهر ٢',
        isOpen: true,
        startsOn: null,
      });
      // A lecture published after the month opened — the course is now leaking,
      // and refusing the rename would only make it harder to fix, not safer.
      await makeLesson(courseId, sectionId);

      const renamed = await service.update(courseId, month.id, { title: 'شهر المراجعة' });
      expect(renamed.title).toBe('شهر المراجعة');
      expect(renamed.untaggedLessonCount).toBe(1);
    });
  });

  describe('list — the three numbers, without an N+1', () => {
    it('reports lessonCount, subscriberCount and the course-wide untagged count', async () => {
      const { courseId, sectionId } = await makeCourse({ monthlyPriceCents: 25000 });
      const first = await service.create(courseId, { monthIndex: 1, title: 'شهر ١', isOpen: false, startsOn: null });
      const second = await service.create(courseId, { monthIndex: 2, title: 'شهر ٢', isOpen: false, startsOn: null });

      const tagged = await makeLesson(courseId, sectionId);
      await service.setLessonMonths(tagged, { primaryMonthId: first.id, extraMonthIds: [second.id] });
      // Untagged, and published — so it is the `{n}` every row carries.
      await makeLesson(courseId, sectionId);

      const live = await makeStudent();
      const revoked = await makeStudent();
      const future = await makeStudent();
      await prisma.accessGrant.createMany({
        data: [
          { userId: live, scope: 'course_month', courseId, monthId: first.id, source: 'purchase' },
          { userId: revoked, scope: 'course_month', courseId, monthId: first.id, source: 'purchase', revokedAt: new Date() },
          {
            userId: future,
            scope: 'course_month',
            courseId,
            monthId: first.id,
            source: 'purchase',
            validFrom: new Date(Date.now() + 86_400_000),
          },
        ],
      });

      const months = await service.list(courseId);
      expect(months.map((month) => month.monthIndex)).toEqual([1, 2]);
      expect(months[0]).toMatchObject({
        lessonCount: 1,
        // «كام واحد بيقرا» — not «كام واحد دفع». The revoked and the
        // not-yet-valid grants are both money that happened and access that
        // did not.
        subscriberCount: 1,
        untaggedLessonCount: 1,
        // One price for any month: the COURSE's, since `priceCents` is the
        // reserved override nothing writes yet.
        priceCents: 25000,
      });
      expect(months[1]).toMatchObject({ lessonCount: 1, subscriberCount: 0, untaggedLessonCount: 1 });
    });

    it('404s on a course that does not exist, rather than answering an empty list', async () => {
      await expect(service.list(MISSING_UUID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a duplicate monthIndex with a 409 rather than overwriting the first', async () => {
      const { courseId } = await makeCourse();
      await service.create(courseId, { monthIndex: 3, title: 'شهر ٣', isOpen: false, startsOn: null });
      await expect(
        service.create(courseId, { monthIndex: 3, title: 'شهر تاني', isOpen: false, startsOn: null }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('will not edit a month through another course id', async () => {
      const { courseId } = await makeCourse();
      const { courseId: otherCourseId } = await makeCourse();
      const month = await service.create(courseId, { monthIndex: 1, title: 'شهر ١', isOpen: false, startsOn: null });

      await expect(service.update(otherCourseId, month.id, { title: 'مش بتاعك' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('refuses with a sentence — not a 500 — when a transfer already bought the month', async () => {
      const { courseId } = await makeCourse();
      const month = await service.create(courseId, { monthIndex: 1, title: 'شهر ١', isOpen: false, startsOn: null });
      const studentId = await makeStudent();
      const submission = await prisma.paymentSubmission.create({
        data: { userId: studentId, courseId, plan: 'monthly', amountCents: 20000, status: 'approved' },
      });
      await prisma.paymentSubmissionMonth.create({
        data: { submissionId: submission.id, monthId: month.id, courseId },
      });

      const failure = await service.remove(courseId, month.id).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ConflictException);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: MONTH_DELETE_BLOCKED_CODE,
        paidSubmissionCount: 1,
      });
      // Still there — the refusal is not a partial delete.
      expect(await prisma.courseMonth.count({ where: { id: month.id } })).toBe(1);
    });

    it('deletes a month nobody paid for, and the lectures merely lose their tag', async () => {
      const { courseId, sectionId } = await makeCourse();
      const month = await service.create(courseId, { monthIndex: 1, title: 'شهر ١', isOpen: false, startsOn: null });
      const lessonId = await makeLesson(courseId, sectionId);
      await service.setLessonMonths(lessonId, { primaryMonthId: month.id, extraMonthIds: [] });

      await service.remove(courseId, month.id);

      expect(await prisma.courseMonth.count({ where: { id: month.id } })).toBe(0);
      expect(await prisma.lessonMonth.count({ where: { lessonId } })).toBe(0);
      expect(await prisma.lesson.count({ where: { id: lessonId } })).toBe(1);
    });

    it('404s on a month of another course', async () => {
      const { courseId } = await makeCourse();
      const { courseId: otherCourseId } = await makeCourse();
      const month = await service.create(courseId, { monthIndex: 1, title: 'شهر ١', isOpen: false, startsOn: null });
      await expect(service.remove(otherCourseId, month.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('PUT lesson months — the whole set, rewritten', () => {
    it('replaces the previous set and moves the primary without colliding with itself', async () => {
      const { courseId, sectionId } = await makeCourse();
      const one = await service.create(courseId, { monthIndex: 1, title: 'شهر ١', isOpen: false, startsOn: null });
      const two = await service.create(courseId, { monthIndex: 2, title: 'شهر ٢', isOpen: false, startsOn: null });
      const three = await service.create(courseId, { monthIndex: 3, title: 'شهر ٣', isOpen: false, startsOn: null });
      const lessonId = await makeLesson(courseId, sectionId);

      await service.setLessonMonths(lessonId, { primaryMonthId: one.id, extraMonthIds: [two.id] });

      // The move `lesson_months_one_primary` would refuse if this were a diff
      // rather than a delete-then-insert.
      const rewritten = await service.setLessonMonths(lessonId, {
        primaryMonthId: two.id,
        extraMonthIds: [three.id],
      });
      expect(rewritten).toEqual({ primaryMonthId: two.id, extraMonthIds: [three.id] });

      const rows = await prisma.lessonMonth.findMany({ where: { lessonId }, orderBy: { monthId: 'asc' } });
      expect(rows).toHaveLength(2);
      expect(rows.filter((row) => row.isPrimary).map((row) => row.monthId)).toEqual([two.id]);
      // Denormalised from both sides — it is what the composite FKs hang off.
      expect(rows.every((row) => row.courseId === courseId)).toBe(true);
      expect(rows.map((row) => row.monthId).sort()).toEqual([two.id, three.id].sort());
    });

    it('clears the set on an empty write — «من غير شهر» is a real, legal state', async () => {
      const { courseId, sectionId } = await makeCourse();
      const month = await service.create(courseId, { monthIndex: 1, title: 'شهر ١', isOpen: false, startsOn: null });
      const lessonId = await makeLesson(courseId, sectionId);
      await service.setLessonMonths(lessonId, { primaryMonthId: month.id, extraMonthIds: [] });

      const cleared = await service.setLessonMonths(lessonId, { primaryMonthId: null, extraMonthIds: [] });
      expect(cleared).toEqual({ primaryMonthId: null, extraMonthIds: [] });
      expect(await prisma.lessonMonth.count({ where: { lessonId } })).toBe(0);
    });

    it("refuses another course's month with a sentence, not the composite FK's 500", async () => {
      const { courseId, sectionId } = await makeCourse();
      const { courseId: otherCourseId } = await makeCourse();
      const foreign = await service.create(otherCourseId, {
        monthIndex: 1,
        title: 'شهر من كورس تاني',
        isOpen: false,
        startsOn: null,
      });
      const lessonId = await makeLesson(courseId, sectionId);

      await expect(
        service.setLessonMonths(lessonId, { primaryMonthId: foreign.id, extraMonthIds: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await prisma.lessonMonth.count({ where: { lessonId } })).toBe(0);
    });

    it('404s on an unknown lesson', async () => {
      await expect(
        service.setLessonMonths(MISSING_UUID, { primaryMonthId: null, extraMonthIds: [] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /**
   * THE BACKWARD-COMPATIBILITY PROMISE, asserted where a student would feel it
   * break.
   *
   * Rule 2 in the instructor's own terms: a course with no `course_months` rows
   * keeps the OLD rolling thirty-day monthly plan, unchanged. `LessonAccessService`
   * is the single gate every progress write goes through, and it skips the month
   * check entirely when the course sells no months — so a plain `scope: course`
   * grant must still open a published lecture, exactly as it did before any of
   * this existed.
   *
   * The second half is the switch itself: creating ONE month on the course is
   * what turns the gate on, and the same student, the same grant and the same
   * lecture then behave differently — but only because a month now exists.
   */
  describe('a course with NO months is untouched', () => {
    it('opens a lecture on a plain course grant, and only a month makes that change', async () => {
      const { courseId, sectionId } = await makeCourse();
      const lessonId = await makeLesson(courseId, sectionId);
      const userId = await makeStudent();
      await prisma.accessGrant.create({ data: { userId, scope: 'course', courseId, source: 'purchase' } });
      await prisma.enrollment.create({ data: { userId, courseId, source: 'purchase', status: 'active' } });

      const before = await lessonAccess.require(userId, lessonId);
      expect(before.lessonId).toBe(lessonId);
      expect(before.courseSellsByMonth).toBe(false);
      expect(before.monthIds).toEqual([]);

      // The switch. One month, created closed and containing nothing, is all it
      // takes for this course to start being sold by month.
      await service.create(courseId, { monthIndex: 1, title: 'شهر ١', isOpen: false, startsOn: null });

      const after = await lessonAccess.require(userId, lessonId);
      // A `scope: course` grant is still WIDER than any month — `monthSliceOf`
      // returns `everything` for it — so this student is unaffected either way.
      // That is the point: turning months on must not evict whoever bought the
      // whole course.
      expect(after.lessonId).toBe(lessonId);
      expect(after.courseSellsByMonth).toBe(true);
    });
  });
  /**
   * The two setup presses that make an EXISTING course sellable by month.
   *
   * The assertion that matters in the second suite is the NEGATIVE one: the
   * student's original course-wide grant comes out untouched, same
   * `validUntil`, same `revokedAt: null`. If that ever stops being true,
   * somebody current on their payments loses access the day the instructor
   * presses a button.
   */
  describe('adoptUntaggedLessons', () => {
    it('adopts every untagged lesson, QUIZZES and drafts included', async () => {
      const { courseId, sectionId } = await makeCourse();
      const lecture = await makeLesson(courseId, sectionId);
      const quiz = await makeLesson(courseId, sectionId, { kind: 'quiz' });
      const draft = await makeLesson(courseId, sectionId, { isPublished: false });
      const month = await service.create(courseId, {
        monthIndex: 1,
        title: 'شهر ١',
        isOpen: false,
        startsOn: null,
      });

      expect(await service.adoptUntaggedLessons(courseId, month.id)).toEqual({ adopted: 3 });

      const rows = await prisma.lessonMonth.findMany({
        where: { monthId: month.id },
        select: { lessonId: true, isPrimary: true },
      });
      expect(rows.map((row) => row.lessonId).sort()).toEqual([lecture, quiz, draft].sort());
      // A quiz left behind is a lecture the student can watch and cannot sit.
      expect(rows.every((row) => row.isPrimary)).toBe(true);
    });

    it('leaves a lesson that already has a month alone', async () => {
      const { courseId, sectionId } = await makeCourse();
      const lessonId = await makeLesson(courseId, sectionId);
      const one = await service.create(courseId, {
        monthIndex: 1,
        title: 'شهر ١',
        isOpen: false,
        startsOn: null,
      });
      const two = await service.create(courseId, {
        monthIndex: 2,
        title: 'شهر ٢',
        isOpen: false,
        startsOn: null,
      });
      await service.setLessonMonths(lessonId, { primaryMonthId: two.id, extraMonthIds: [] });

      // Setup for the untagged, never a reassignment.
      expect(await service.adoptUntaggedLessons(courseId, one.id)).toEqual({ adopted: 0 });
      expect(await prisma.lessonMonth.count({ where: { lessonId, monthId: two.id } })).toBe(1);
    });

    it('is what unblocks opening the month for sale', async () => {
      const { courseId, sectionId } = await makeCourse();
      await makeLesson(courseId, sectionId);
      const month = await service.create(courseId, {
        monthIndex: 1,
        title: 'شهر ١',
        isOpen: false,
        startsOn: null,
      });

      await expect(service.update(courseId, month.id, { isOpen: true })).rejects.toBeInstanceOf(
        ConflictException,
      );

      await service.adoptUntaggedLessons(courseId, month.id);
      expect(await service.update(courseId, month.id, { isOpen: true })).toMatchObject({
        isOpen: true,
      });
    });
  });

  describe('openMonthForSubscribers', () => {
    async function makeSubscriber(
      courseId: string,
      plan: 'monthly' | 'quarterly' | 'yearly',
      validUntil: Date | null,
    ) {
      const userId = await makeStudent();
      const grant = await prisma.accessGrant.create({
        data: {
          userId,
          scope: 'course',
          courseId,
          source: 'purchase',
          // Backdated, because `access_grants_window_ordered` refuses a window
          // that ends before it starts — and the lapsed case below is exactly
          // a `validUntil` in the past.
          validFrom: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
          validUntil,
        },
        select: { id: true },
      });
      await prisma.paymentSubmission.create({
        data: {
          userId,
          courseId,
          plan,
          status: 'approved',
          amountCents: 15000,
          screenshotKey: 'k',
          grantId: grant.id,
        },
      });
      return { userId, grantId: grant.id };
    }

    async function makeMonth(courseId: string, monthIndex: number) {
      return service.create(courseId, {
        monthIndex,
        title: `شهر ${monthIndex}`,
        isOpen: false,
        startsOn: null,
      });
    }

    const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    it('counts without writing on a dry run', async () => {
      const { courseId } = await makeCourse();
      const month = await makeMonth(courseId, 1);
      await makeSubscriber(courseId, 'monthly', future());

      expect(await service.openMonthForSubscribers(courseId, month.id, true)).toMatchObject({
        students: 1,
        grantsWritten: 0,
        dryRun: true,
      });
      expect(await prisma.accessGrant.count({ where: { courseId, scope: 'course_month' } })).toBe(0);
    });

    it('opens the month WITHOUT touching the grant they paid for', async () => {
      const { courseId } = await makeCourse();
      const month = await makeMonth(courseId, 1);
      const validUntil = future();
      const { userId, grantId } = await makeSubscriber(courseId, 'monthly', validUntil);

      expect(await service.openMonthForSubscribers(courseId, month.id, false)).toMatchObject({
        students: 1,
        grantsWritten: 1,
        dryRun: false,
      });

      const written = await prisma.accessGrant.findFirstOrThrow({
        where: { userId, courseId, scope: 'course_month', monthId: month.id },
        select: { validUntil: true, revokedAt: true },
      });
      // The CHECK would have rolled the whole thing back, but asserting it here
      // is what names the rule: a month is content, not thirty days.
      expect(written.validUntil).toBeNull();
      expect(written.revokedAt).toBeNull();

      const original = await prisma.accessGrant.findUniqueOrThrow({
        where: { id: grantId },
        select: { validUntil: true, revokedAt: true },
      });
      expect(original.revokedAt).toBeNull();
      expect(original.validUntil?.getTime()).toBe(validUntil.getTime());
    });

    it('takes «٣ شهور» and yearly buyers too — they all bought the course by DATE', async () => {
      const { courseId } = await makeCourse();
      const month = await makeMonth(courseId, 1);
      await makeSubscriber(courseId, 'monthly', future());
      await makeSubscriber(courseId, 'quarterly', future());
      await makeSubscriber(courseId, 'yearly', future());

      expect(await service.openMonthForSubscribers(courseId, month.id, false)).toMatchObject({
        students: 3,
        grantsWritten: 3,
      });
    });

    it('is idempotent — a second press writes nothing', async () => {
      const { courseId } = await makeCourse();
      const month = await makeMonth(courseId, 1);
      await makeSubscriber(courseId, 'monthly', future());

      await service.openMonthForSubscribers(courseId, month.id, false);
      expect(await service.openMonthForSubscribers(courseId, month.id, false)).toMatchObject({
        students: 1,
        grantsWritten: 0,
      });
      expect(await prisma.accessGrant.count({ where: { courseId, scope: 'course_month' } })).toBe(1);
    });

    it('skips a subscription that already lapsed', async () => {
      // They are not «اللي مشترك» any more — they are somebody who has to
      // subscribe again, and a free month would be a refund nobody authorised.
      const { courseId } = await makeCourse();
      const month = await makeMonth(courseId, 1);
      await makeSubscriber(courseId, 'monthly', new Date(Date.now() - 24 * 60 * 60 * 1000));

      expect(await service.openMonthForSubscribers(courseId, month.id, false)).toMatchObject({
        students: 0,
        grantsWritten: 0,
      });
    });

    it('leaves a TERM buyer out of it', async () => {
      // Their access is already a slice with its own cutoff, nothing here
      // changes it, and a permanent month they never asked for crosses the two
      // axes on somebody who did not choose to be crossed.
      const { courseId } = await makeCourse();
      const month = await makeMonth(courseId, 1);
      const term = await prisma.courseTerm.create({
        data: { courseId, title: 'الترم الأول', position: 0 },
      });
      const userId = await makeStudent();
      await prisma.accessGrant.create({
        data: { userId, scope: 'term', courseId, termId: term.id, source: 'purchase' },
      });

      expect(await service.openMonthForSubscribers(courseId, month.id, false)).toMatchObject({
        students: 0,
      });
    });

    it('leaves an ADMIN-issued grant out of it', async () => {
      const { courseId } = await makeCourse();
      const month = await makeMonth(courseId, 1);
      const userId = await makeStudent();
      await prisma.accessGrant.create({
        data: { userId, scope: 'course', courseId, source: 'admin' },
      });

      expect(await service.openMonthForSubscribers(courseId, month.id, false)).toMatchObject({
        students: 0,
      });
    });

    it('404s on a month of another course', async () => {
      const a = await makeCourse();
      const b = await makeCourse();
      const month = await makeMonth(b.courseId, 1);

      await expect(
        service.openMonthForSubscribers(a.courseId, month.id, true),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

});
