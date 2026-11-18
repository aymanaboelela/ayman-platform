// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { EnrollmentService } from '../enrollment/enrollment.service';
import type { MediaService } from '../media/media.service';
import type { MediaStorage } from '../media/storage/media-storage';
import { NotificationsService } from '../notifications/notifications.service';
import { DailyEssayService } from './daily-essay.service';

/**
 * «السؤال المقالي اليومي», end to end against a real database.
 *
 * ## What is faked, and what deliberately is not
 *
 * `MediaStorage` is a Map, for the reason `homework.service.spec.ts` gives:
 * the one thing worth asserting about the bucket is what gets DELETED, and a
 * Map answers that exactly.
 *
 * `EnrollmentService` is a stub that answers `listOwn` — «which courses does
 * this student hold live access to» has its own suite, and every claim here
 * starts AFTER that answer: who a question is addressed to given it.
 *
 * Prisma is real. Every claim is about rows: one answer per student per
 * question, what survives a mark, when the model answer leaves the server.
 *
 * Time is passed in. The service takes `now` on every method that reads the
 * calendar, so «tomorrow» is an argument and not a sleep.
 */
describe('DailyEssayService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(prisma);
  const media = {} as unknown as MediaService;

  const objects = new Map<string, number>();
  const storage: MediaStorage = {
    put: async (key, body) => {
      objects.set(key, body.byteLength);
    },
    getStream: () => {
      throw new Error('not used');
    },
    stat: async (key) => (objects.has(key) ? { size: objects.get(key)! } : null),
    delete: async (key) => {
      objects.delete(key);
    },
  };

  /** Who holds live access to what — the stubbed half of the audience. */
  const liveCourses = new Map<string, string[]>();
  const enrollments = {
    listOwn: async (userId: string) =>
      (liveCourses.get(userId) ?? []).map((courseId) => ({ courseId, accessActive: true })),
  } as unknown as EnrollmentService;

  const service = new DailyEssayService(prisma, enrollments, media, notifications, audit, storage);

  // Far in the future, so nothing a developer scheduled by hand on this
  // database is ever «today» for these tests. Noon UTC is 2–3 pm in Cairo, the
  // same calendar day.
  const D1 = '2031-03-10';
  const D2 = '2031-03-11';
  const D3 = '2031-03-12';
  const at = (day: string) => new Date(`${day}T12:00:00Z`);
  const date = (day: string) => new Date(`${day}T00:00:00Z`);

  let adminId = '';
  let studentId = '';
  let otherStudentId = '';
  let outsiderId = '';
  let courseId = '';
  let otherCourseId = '';
  const essayIds: string[] = [];

  let keySeq = 0;
  function storedKey(): string {
    keySeq += 1;
    const uuid = `00000000-0000-7000-9000-${String(keySeq).padStart(12, '0')}`;
    const key = `hw/${uuid.slice(0, 2)}/${uuid}.webp`;
    objects.set(key, 1234);
    return key;
  }

  async function essay(day: string, courses: string[], extra: { isPublished?: boolean; maxMarks?: number } = {}) {
    const row = await prisma.dailyEssay.create({
      data: {
        day: date(day),
        body: `سؤال ${day}\nاشرح بالتفصيل.`,
        modelAnswer: `الإجابة النموذجية ${day}`,
        maxMarks: extra.maxMarks ?? 10,
        isPublished: extra.isPublished ?? true,
        courses: { create: courses.map((id) => ({ courseId: id })) },
      },
      select: { id: true },
    });
    essayIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();
    const user = (tag: string, role?: string) =>
      prisma.user.create({
        data: { id: `essay-${tag}-${stamp}`, name: tag, email: `essay-${tag}-${stamp}@t.test`, ...(role ? { role } : {}) },
      });

    adminId = (await user('admin', 'admin')).id;
    studentId = (await user('student')).id;
    otherStudentId = (await user('other')).id;
    outsiderId = (await user('outsider')).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const course = (slug: string, title: string) =>
      prisma.course.create({
        data: {
          slug: `essay-${slug}-${stamp}`,
          title,
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId: adminId,
        },
      });
    courseId = (await course('a', 'كورس المقالي')).id;
    otherCourseId = (await course('b', 'كورس تاني')).id;

    liveCourses.set(studentId, [courseId]);
    liveCourses.set(otherStudentId, [courseId]);
    // `outsiderId` holds nothing.
  });

  afterEach(async () => {
    await prisma.dailyEssaySubmission.deleteMany({ where: { essayId: { in: essayIds } } });
    await prisma.dailyEssay.deleteMany({ where: { id: { in: essayIds } } });
    essayIds.length = 0;
    objects.clear();
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [studentId, otherStudentId, outsiderId] } } });
    await prisma.course.deleteMany({ where: { id: { in: [courseId, otherCourseId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, studentId, otherStudentId, outsiderId] } } });
    await prisma.$disconnect();
  });

  describe('who a question is for', () => {
    it("shows today's question to a student of its course, without the model answer", async () => {
      const id = await essay(D1, [courseId]);

      const page = await service.page(studentId, at(D1));

      expect(page.today?.id).toBe(id);
      expect(page.today?.open).toBe(true);
      expect(page.today?.submission).toBeNull();
      expect(page.today?.modelAnswer).toBeNull();
    });

    it('hides a question that is for another course, not yet due, or unpublished', async () => {
      const hidden = [
        await essay(D1, [otherCourseId]),
        await essay(D2, [courseId]),
        await essay(D1, [courseId], { isPublished: false }),
      ];

      const page = await service.page(studentId, at(D1));

      // By id, not `toEqual([])`: a database with somebody's earlier
      // «for everyone» questions in it would legitimately list those.
      expect(page.today).toBeNull();
      const listed = page.history.map((entry) => entry.id);
      for (const id of hidden) expect(listed).not.toContain(id);
    });

    it('treats a question with no course as for every student who holds a real course', async () => {
      const id = await essay(D1, []);

      expect((await service.page(studentId, at(D1))).today?.id).toBe(id);
      expect((await service.page(outsiderId, at(D1))).today).toBeNull();
    });

    it('answers 404 to a hand-in on a question that is not theirs', async () => {
      const id = await essay(D1, [otherCourseId]);

      await expect(service.submit(studentId, id, { images: [], text: 'إجابة' }, at(D1))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('the answer window', () => {
    it("keeps yesterday's question open, and closes it the day after", async () => {
      const id = await essay(D1, [courseId]);

      const nextDay = await service.page(studentId, at(D2));
      expect(nextDay.today).toBeNull();
      expect(nextDay.history[0]?.id).toBe(id);
      expect(nextDay.history[0]?.open).toBe(true);
      expect(nextDay.history[0]?.modelAnswer).toBeNull();

      const closed = await service.page(studentId, at(D3));
      expect(closed.history[0]?.open).toBe(false);
      // Closed and never answered: the model answer is shown so the question
      // still teaches something.
      expect(closed.history[0]?.modelAnswer).toBe(`الإجابة النموذجية ${D1}`);
      await expect(service.submit(studentId, id, { images: [], text: 'متأخر' }, at(D3))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('handing in', () => {
    it('takes a typed answer, and keeps the model answer back until it is marked', async () => {
      const id = await essay(D1, [courseId]);

      const saved = await service.submit(studentId, id, { images: [], text: 'إجابتي المكتوبة' }, at(D1));

      expect(saved).toMatchObject({ status: 'submitted', answerText: 'إجابتي المكتوبة', imageCount: 0, mark: null });
      const page = await service.page(studentId, at(D1));
      expect(page.today?.submission?.id).toBe(saved.id);
      expect(page.today?.modelAnswer).toBeNull();
      expect(page.stats).toEqual({ answered: 1, marked: 0, averagePercent: null });
    });

    it('replaces an unmarked answer in place and deletes the photographs it replaced', async () => {
      const id = await essay(D1, [courseId]);
      const first = storedKey();
      const second = storedKey();

      const one = await service.submit(studentId, id, { images: [{ storageKey: first, sizeBytes: 1234 }], text: null }, at(D1));
      const two = await service.submit(studentId, id, { images: [{ storageKey: second, sizeBytes: 1234 }], text: null }, at(D1));

      expect(two.id).toBe(one.id);
      expect(two.imageCount).toBe(1);
      expect(await prisma.dailyEssaySubmission.count({ where: { essayId: id } })).toBe(1);
      expect(objects.has(first)).toBe(false);
      expect(objects.has(second)).toBe(true);
    });

    it('refuses a key that is not in the bucket, and more pages than the question allows', async () => {
      const id = await essay(D1, [courseId]);
      await prisma.dailyEssay.update({ where: { id }, data: { maxImages: 1 } });

      await expect(
        service.submit(
          studentId,
          id,
          { images: [{ storageKey: 'hw/00/00000000-0000-7000-9000-999999999999.webp', sizeBytes: 5 }], text: null },
          at(D1),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.submit(
          studentId,
          id,
          { images: [{ storageKey: storedKey(), sizeBytes: 5 }, { storageKey: storedKey(), sizeBytes: 5 }], text: null },
          at(D1),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('marking', () => {
    it('writes the mark, deletes the photographs, tells the student and releases the model answer', async () => {
      const id = await essay(D1, [courseId]);
      const key = storedKey();
      const saved = await service.submit(studentId, id, { images: [{ storageKey: key, sizeBytes: 1234 }], text: null }, at(D1));

      await service.mark(adminId, saved.id, { mark: 7.5, note: 'إجابة كويسة، ناقصها مثال.' }, at(D1));

      const page = await service.page(studentId, at(D1));
      expect(page.today?.submission).toMatchObject({
        status: 'marked',
        mark: 7.5,
        maxMarks: 10,
        reviewNote: 'إجابة كويسة، ناقصها مثال.',
        // The count survives the pictures: «سلّمت صورة».
        imageCount: 1,
        imageIds: [],
        imagesPurged: true,
      });
      expect(page.today?.modelAnswer).toBe(`الإجابة النموذجية ${D1}`);
      expect(page.today?.open).toBe(false);
      expect(page.stats).toEqual({ answered: 1, marked: 1, averagePercent: 75 });
      expect(objects.has(key)).toBe(false);

      const told = await prisma.notification.findFirst({
        where: { userId: studentId, kind: 'essay_marked' },
        orderBy: { createdAt: 'desc' },
      });
      expect(told?.payload).toMatchObject({ submissionId: saved.id, essayId: id, mark: 7.5, maxMarks: 10 });
    });

    it('refuses a mark above the total, and a new answer once marked', async () => {
      const id = await essay(D1, [courseId], { maxMarks: 5 });
      const saved = await service.submit(studentId, id, { images: [], text: 'إجابة' }, at(D1));

      await expect(service.mark(adminId, saved.id, { mark: 6, note: null }, at(D1))).rejects.toBeInstanceOf(
        BadRequestException,
      );

      await service.mark(adminId, saved.id, { mark: 5, note: null }, at(D1));
      // Marked means finished: otherwise the model answer just shown could be
      // handed straight back in.
      await expect(service.submit(studentId, id, { images: [], text: 'تاني' }, at(D1))).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('keeps the total a mark was out of when the question is edited afterwards', async () => {
      const id = await essay(D1, [courseId]);
      const saved = await service.submit(studentId, id, { images: [], text: 'إجابة' }, at(D1));
      await service.mark(adminId, saved.id, { mark: 7, note: null }, at(D1));

      await service.update(id, { maxMarks: 20 });
      await service.mark(adminId, saved.id, { mark: 8, note: null }, at(D1));

      const row = await prisma.dailyEssaySubmission.findUniqueOrThrow({ where: { id: saved.id } });
      expect(Number(row.mark)).toBe(8);
      expect(row.maxMarks).toBe(10);
    });

    it('sends the marker to the same question first, then to the oldest waiting anywhere', async () => {
      const first = await essay(D1, [courseId]);
      const second = await essay(D2, [courseId]);
      const older = await service.submit(otherStudentId, second, { images: [], text: 'أقدم إجابة' }, new Date(`${D2}T08:00:00Z`));
      // Older than anything a shared database could already hold, so «the
      // oldest waiting anywhere» is this row whatever else is in the table.
      await prisma.dailyEssaySubmission.update({
        where: { id: older.id },
        data: { submittedAt: new Date('2001-01-01T00:00:00Z') },
      });
      const mine = await service.submit(studentId, first, { images: [], text: 'إجابتي' }, new Date(`${D2}T09:00:00Z`));
      const sibling = await service.submit(otherStudentId, first, { images: [], text: 'نفس السؤال' }, new Date(`${D2}T10:00:00Z`));

      const detail = await service.detail(mine.id);
      expect(detail.nextPendingId).toBe(sibling.id);
      expect(detail.modelAnswer).toBe(`الإجابة النموذجية ${D1}`);

      await service.mark(adminId, sibling.id, { mark: 9, note: null }, at(D2));
      expect((await service.detail(mine.id)).nextPendingId).toBe(older.id);

      const queue = await service.queue('pending', first, 10, 0);
      expect(queue.rows.map((row) => row.id)).toEqual([mine.id]);
    });
  });

  describe('the schedule', () => {
    it('lays a batch on consecutive days, stepping over the skipped weekday', async () => {
      // 2031-03-13 is a Thursday, so the second question would land on Friday.
      const result = await service.createBatch(adminId, {
        courseIds: [courseId],
        startDay: '2031-03-13',
        skipWeekdays: [5],
        maxImages: 4,
        isPublished: true,
        items: [
          { body: 'السؤال الأول', modelAnswer: 'إجابة ١', maxMarks: 10 },
          { body: 'السؤال التاني', modelAnswer: 'إجابة ٢', maxMarks: 5 },
        ],
      });
      const created = await prisma.dailyEssay.findMany({
        where: { createdById: adminId, day: { gte: date('2031-03-13') } },
        orderBy: { day: 'asc' },
        select: { id: true, day: true, maxMarks: true, courses: { select: { courseId: true } } },
      });
      essayIds.push(...created.map((row) => row.id));

      expect(result).toEqual({ created: 2, firstDay: '2031-03-13', lastDay: '2031-03-15' });
      expect(created.map((row) => row.day.toISOString().slice(0, 10))).toEqual(['2031-03-13', '2031-03-15']);
      expect(created[1]?.maxMarks).toBe(5);
      expect(created[0]?.courses).toEqual([{ courseId }]);
    });

    it('refuses a batch for a course that does not exist', async () => {
      await expect(
        service.createBatch(adminId, {
          courseIds: ['00000000-0000-7000-8000-00000000dead'],
          startDay: D1,
          skipWeekdays: [],
          maxImages: 4,
          isPublished: true,
          items: [{ body: 'سؤال', modelAnswer: 'إجابة', maxMarks: 10 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes an unanswered question and refuses one with answers', async () => {
      const empty = await essay(D1, [courseId]);
      const answered = await essay(D2, [courseId]);
      await service.submit(studentId, answered, { images: [], text: 'إجابة' }, at(D2));

      await service.remove(empty);
      expect(await prisma.dailyEssay.findUnique({ where: { id: empty } })).toBeNull();

      await expect(service.remove(answered)).rejects.toBeInstanceOf(ConflictException);
      expect(await prisma.dailyEssay.findUnique({ where: { id: answered } })).not.toBeNull();
    });

    it('counts the answers on each question, and how many still wait', async () => {
      const id = await essay(D1, [courseId]);
      const one = await service.submit(studentId, id, { images: [], text: 'إجابة' }, at(D1));
      await service.submit(otherStudentId, id, { images: [], text: 'إجابة' }, at(D1));
      await service.mark(adminId, one.id, { mark: 10, note: null }, at(D1));

      const row = await service.update(id, { isPublished: true });

      expect(row).toMatchObject({ submitted: 2, pending: 1, courses: [{ id: courseId, title: 'كورس المقالي' }] });
    });
  });

  describe('the image sweep', () => {
    it('deletes the photographs of an answer nobody marked for thirty days, and keeps the answer', async () => {
      const id = await essay(D1, [courseId]);
      const key = storedKey();
      const saved = await service.submit(studentId, id, { images: [{ storageKey: key, sizeBytes: 1234 }], text: null }, at(D1));

      expect(await service.purgeExpiredImages(10, at('2031-03-20'))).toBe(0);
      expect(await service.purgeExpiredImages(10, at('2031-04-20'))).toBe(1);

      expect(objects.has(key)).toBe(false);
      const row = await prisma.dailyEssaySubmission.findUniqueOrThrow({ where: { id: saved.id } });
      expect(row.imageCount).toBe(1);
      expect(row.imagesPurgedAt).not.toBeNull();
      expect(row.status).toBe('submitted');
    });
  });
});
