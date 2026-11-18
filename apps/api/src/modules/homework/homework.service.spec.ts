// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { MediaService } from '../media/media.service';
import type { MediaStorage } from '../media/storage/media-storage';
import type { LessonAccessService } from '../progress/lesson-access.service';
import { HomeworkService } from './homework.service';

/* `homeworkChatCard` is on for this suite (it runs as his stack) except in the
   one test that closes it — a variable rather than `jest.fn`, so a test that
   forgets to restore it fails loudly in the next one instead of silently. */
let cardFeatureOn = true;
jest.mock('../../common/entitlements', () => ({
  isFeatureEnabled: (key: string) => (key === 'homeworkChatCard' ? cardFeatureOn : true),
}));

/**
 * الواجب, end to end against a real database.
 *
 * ## What is faked, and what deliberately is not
 *
 * `MediaStorage` is a Map. Everything this service does to the bucket is
 * `stat`, `put` (through `MediaService`, not exercised here) and `delete`, and
 * the ONE thing worth asserting about it is the one a real disk would make
 * hardest to see: that accepting an answer removes the objects, that a
 * resubmission removes the previous attempt's, and that the sweep removes
 * everything past thirty days. A Map answers all three exactly.
 *
 * `LessonAccessService` is a stub because it has its own suite
 * (`gate-enforcement.spec.ts`, `resource-access.spec.ts`) and re-testing the
 * enrolment gate here would test that file twice and this one not at all. What
 * IS tested here is that the service asks it, and that a published-homework
 * check runs on top of it.
 *
 * Prisma is real. Every claim in this file is about rows: what survives an
 * accept, what an `imageCount` says after the pictures are gone, and whether a
 * second submission is a second row (it must not be).
 */
describe('HomeworkService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(prisma);
  const media = {} as unknown as MediaService;

  /** The bucket, as a Map. `delete` is the method this suite is really about. */
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

  let adminId = '';
  let studentId = '';
  let courseId = '';
  let lessonId = '';
  let unpublishedLessonId = '';

  const access = {
    require: async (_userId: string, id: string) => {
      if (id !== lessonId && id !== unpublishedLessonId) throw new NotFoundException();
      return { lessonId: id, courseId, kind: 'video', courseSlug: 'x', enrollmentId: 'e', durationSeconds: 0, termId: null };
    },
  } as unknown as LessonAccessService;

  const service = new HomeworkService(prisma, media, access, notifications, audit, storage);

  /** A key of the exact shape the CHECK constraint accepts, already "stored". */
  let keySeq = 0;
  function storedKey(): string {
    keySeq += 1;
    const uuid = `00000000-0000-7000-8000-${String(keySeq).padStart(12, '0')}`;
    const key = `hw/${uuid.slice(0, 2)}/${uuid}.webp`;
    objects.set(key, 1234);
    return key;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    adminId = (
      await prisma.user.create({
        data: { id: `hw-admin-${stamp}`, name: 'أدمن', email: `hw-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
    studentId = (
      await prisma.user.create({
        data: { id: `hw-student-${stamp}`, name: 'طالب', email: `hw-student-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    const course = await prisma.course.create({
      data: {
        slug: `hw-course-${stamp}`,
        title: 'كورس الواجبات',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        subjectId: subject.id,
        year: 2,
        instructorId: adminId,
      },
    });
    courseId = course.id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة الأولى', position: 0, isPublished: true },
    });

    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'المحاضرة الأولى',
        kind: 'video',
        position: 0,
        isPublished: true,
      },
    });
    lessonId = lesson.id;

    const other = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'محاضرة من غير واجب منشور',
        kind: 'video',
        position: 1,
        isPublished: true,
      },
    });
    unpublishedLessonId = other.id;

    await prisma.lessonHomework.create({
      data: { lessonId, body: 'حل تمرين ١ و ٢ و ٣', maxImages: 3, isPublished: true },
    });
    // Same lecture shape, homework still a DRAFT — the case every student-facing
    // path has to treat as "there is nothing here".
    await prisma.lessonHomework.create({
      data: { lessonId: unpublishedLessonId, body: 'لسه بكتبه', maxImages: 3, isPublished: false },
    });
  });

  afterAll(async () => {
    // The course cascades to sections, lessons, `lesson_homework` and every
    // submission and image under them. `audit_log` is INSERT-only for
    // `ayman_runtime` (a DELETE there is a 42501 that only CI sees), so nothing
    // here tries to tidy its own audit rows.
    await prisma.course.deleteMany({ where: { id: courseId } });
    /*
     * The conversations go BEFORE the users, and that ordering is load-bearing.
     *
     * `conversations.user_id` is `SetNull` on a deleted account — deliberately,
     * so a student deleting themselves does not erase the instructor's side of
     * a thread — but `conversations_outreach_has_owner` requires an `outreach`
     * row to HAVE a user. Deleting the student first therefore fails with a
     * 23514 on a constraint that has nothing to do with this feature, and the
     * error names the conversations table rather than the delete that caused
     * it. Marking a submission creates one of these threads, so this suite
     * always has one to clean up.
     */
    await prisma.conversation.deleteMany({ where: { userId: { in: [adminId, studentId] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [adminId, studentId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, studentId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.homeworkSubmission.deleteMany({ where: { userId: studentId } });
    // Notifications too: several tests assert on «the one row of this kind»,
    // and a leftover from the previous test makes the assertion read the wrong
    // verdict — which is exactly how this suite first went green on a false
    // positive.
    await prisma.notification.deleteMany({ where: { userId: { in: [adminId, studentId] } } });
    objects.clear();
  });

  /*
   * «الدنيا ملخبطة… الدرس إيه واجباته إيه». The queue used to be one flat
   * stream; the overview is one line per lecture, in the course's own order.
   */
  describe('the queue, by lecture', () => {
    async function seed() {
      await prisma.homeworkSubmission.deleteMany({ where: { userId: adminId } });
      const row = (lesson: string, userId: string, status: 'submitted' | 'accepted' | 'needs_work', at: string) =>
        prisma.homeworkSubmission.create({
          data: { lessonId: lesson, userId, courseId, status, imageCount: 2, submittedAt: new Date(at) },
        });
      // The SECOND lecture got the newest hand-in, and still lists second.
      await row(lessonId, studentId, 'submitted', '2026-10-01T10:00:00Z');
      await row(lessonId, adminId, 'accepted', '2026-10-02T10:00:00Z');
      await row(unpublishedLessonId, studentId, 'needs_work', '2026-10-05T10:00:00Z');
    }

    afterEach(async () => {
      await prisma.homeworkSubmission.deleteMany({ where: { userId: adminId } });
    });

    it('counts each lecture by status, in the course outline order', async () => {
      await seed();
      const mine = (await service.adminLessons()).filter((line) => line.courseId === courseId);
      expect(mine.map((line) => line.lessonId)).toEqual([lessonId, unpublishedLessonId]);
      expect(mine[0]).toMatchObject({
        lessonTitle: 'المحاضرة الأولى',
        sectionTitle: 'الوحدة الأولى',
        courseTitle: 'كورس الواجبات',
        pending: 1,
        accepted: 1,
        needsWork: 0,
        lastSubmittedAt: '2026-10-02T10:00:00.000Z',
      });
      expect(mine[1]).toMatchObject({ pending: 0, accepted: 0, needsWork: 1 });
    });

    it('opens one lecture’s list without the other lecture’s students', async () => {
      await seed();
      const list = await service.adminList('all', undefined, 50, 0, lessonId);
      expect(list.rowCount).toBe(2);
      expect(list.rows.every((row) => row.lessonId === lessonId)).toBe(true);
      const pending = await service.adminList('pending', undefined, 50, 0, unpublishedLessonId);
      expect(pending.rowCount).toBe(0);
    });

    it('lists one student’s work across lectures, and nobody else’s', async () => {
      await seed();
      const list = await service.adminList('all', courseId, 50, 0, undefined, studentId);
      expect(list.rowCount).toBe(2);
      expect(list.rows.every((row) => row.studentId === studentId)).toBe(true);
      expect(new Set(list.rows.map((row) => row.lessonId))).toEqual(new Set([lessonId, unpublishedLessonId]));
    });
  });

  describe('what a student can see', () => {
    it('shows a published exercise and no submission yet', async () => {
      const homework = await service.forStudent(studentId, lessonId);

      expect(homework?.body).toBe('حل تمرين ١ و ٢ و ٣');
      expect(homework?.maxImages).toBe(3);
      expect(homework?.submission).toBeNull();
    });

    it('shows NOTHING for a draft exercise', async () => {
      // The whole reason `isPublished` exists: the editor autosaves, so a row
      // that existed would put a half-typed sentence in front of every enrolled
      // student.
      expect(await service.forStudent(studentId, unpublishedLessonId)).toBeNull();
    });

    it('refuses an upload against a draft exercise, as a 404 and not a 403', async () => {
      // 404, because a 403 would tell the student an exercise exists that they
      // have not been told about.
      await expect(
        service.submit(studentId, unpublishedLessonId, { images: [{ storageKey: storedKey(), sizeBytes: 1 }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('handing in', () => {
    it('writes the pages and reports them back', async () => {
      const first = storedKey();
      const second = storedKey();

      const submission = await service.submit(studentId, lessonId, {
        images: [
          { storageKey: first, sizeBytes: 100 },
          { storageKey: second, sizeBytes: 200 },
        ],
      });

      expect(submission.status).toBe('submitted');
      expect(submission.attempt).toBe(1);
      expect(submission.imageCount).toBe(2);
      expect(submission.imageIds).toHaveLength(2);
      expect(submission.imagesPurged).toBe(false);
    });

    it('refuses a key that is not in the bucket', async () => {
      // The schema proves the SHAPE; only the storage can say it is a key to
      // something. Without this check a fabricated value becomes a permanent
      // broken thumbnail on his review screen.
      await expect(
        service.submit(studentId, lessonId, {
          images: [{ storageKey: 'hw/ab/00000000-0000-7000-8000-999999999999.webp', sizeBytes: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses more pages than the exercise allows', async () => {
      await expect(
        service.submit(studentId, lessonId, {
          images: [1, 2, 3, 4].map(() => ({ storageKey: storedKey(), sizeBytes: 1 })),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tells whoever holds homework:read', async () => {
      await service.submit(studentId, lessonId, {
        images: [{ storageKey: storedKey(), sizeBytes: 1 }],
      });

      const alerts = await prisma.notification.findMany({
        where: { userId: adminId, kind: 'homework_submitted' },
      });
      expect(alerts).toHaveLength(1);
    });
  });

  describe('marking', () => {
    async function handIn(pages = 2) {
      const keys = Array.from({ length: pages }, () => storedKey());
      await service.submit(studentId, lessonId, {
        images: keys.map((storageKey) => ({ storageKey, sizeBytes: 10 })),
      });
      const row = await prisma.homeworkSubmission.findFirstOrThrow({
        where: { userId: studentId, lessonId },
      });
      return { id: row.id, keys };
    }

    it('«مقبول» deletes the photographs and keeps the record', async () => {
      const { id, keys } = await handIn(2);

      await service.review(adminId, id, { decision: 'accepted', grade: 90, message: 'تمام كده.' });

      // «ما تبينوش إنها اتمسحت» — the row, the count and the mark all survive;
      // only the bytes go.
      const row = await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('accepted');
      expect(row.imageCount).toBe(2);
      expect(Number(row.grade)).toBe(90);
      expect(row.reviewNote).toBe('تمام كده.');
      expect(row.imagesPurgedAt).not.toBeNull();

      expect(await prisma.homeworkImage.count({ where: { submissionId: id } })).toBe(0);
      for (const key of keys) expect(objects.has(key)).toBe(false);
    });

    it('allows updating the grade and note on an already-accepted submission', async () => {
      const { id } = await handIn(1);
      await service.review(adminId, id, { decision: 'accepted', grade: 0, message: '-0' });

      let row = await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id } });
      expect(Number(row.grade)).toBe(0);

      await service.review(adminId, id, { decision: 'accepted', grade: 100, message: 'ممتاز. كله صح.' });

      row = await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id } });
      expect(Number(row.grade)).toBe(100);
      expect(row.reviewNote).toBe('ممتاز. كله صح.');
    });

    it('«يفكّر تاني» keeps them, so he can look again', async () => {
      const { id, keys } = await handIn(1);

      await service.review(adminId, id, {
        decision: 'needs_work',
        grade: null,
        message: 'مراجعة صغيرة للخطوة الأخيرة.',
      });

      const row = await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('needs_work');
      expect(row.imagesPurgedAt).toBeNull();
      expect(await prisma.homeworkImage.count({ where: { submissionId: id } })).toBe(1);
      expect(objects.has(keys[0]!)).toBe(true);
    });

    it('delivers the words as a message in the student’s own thread', async () => {
      const { id } = await handIn(1);

      await service.review(adminId, id, {
        decision: 'needs_work',
        grade: null,
        message: 'الحل قرّب خالص.',
      });

      // An ordinary `conversation_messages` row in an ordinary thread — which
      // is the whole design: a student who replies is replying into the inbox
      // he already reads, and a voice note goes to the same place.
      const conversation = await prisma.conversation.findFirstOrThrow({
        where: { userId: studentId, origin: 'outreach' },
        include: { messages: true },
      });
      expect(conversation.lastMessageAuthor).toBe('admin');
      expect(conversation.status).toBe('answered');
      expect(conversation.messages.at(-1)?.body).toBe('الحل قرّب خالص.');

      const notice = await prisma.notification.findFirstOrThrow({
        where: { userId: studentId, kind: 'homework_reviewed' },
      });
      expect(notice.payload).toMatchObject({ homeworkStatus: 'needs_work' });
    });
  });

  /*
   * «تصحيح الواجب» in the chat — the card on the review's message. The words
   * stay on `body`; what is asserted here is the typed frame next to them and
   * that a second verdict on one hand-in does not stack a second card.
   */
  describe('the feedback card in the chat', () => {
    async function handIn() {
      await service.submit(studentId, lessonId, {
        images: [{ storageKey: storedKey(), sizeBytes: 10 }],
      });
      return prisma.homeworkSubmission.findFirstOrThrow({ where: { userId: studentId, lessonId } });
    }

    const cardsFor = (submissionId: string) =>
      prisma.conversationMessage.findMany({
        where: {
          conversation: { userId: studentId },
          card: { path: ['submissionId'], equals: submissionId },
        },
        orderBy: { createdAt: 'asc' },
      });

    afterEach(() => {
      cardFeatureOn = true;
    });

    it('frames the note with the lecture, the verdict and the mark', async () => {
      const row = await handIn();
      await service.review(adminId, row.id, {
        decision: 'accepted',
        grade: 85,
        message: '✅ الخطوات مترتبة\n✏️ الوحدات ناقصة',
      });

      const [message, ...rest] = await cardsFor(row.id);
      expect(rest).toHaveLength(0);
      expect(message?.author).toBe('admin');
      expect(message?.body).toBe('✅ الخطوات مترتبة\n✏️ الوحدات ناقصة');
      expect(message?.card).toEqual({
        kind: 'homework_review',
        submissionId: row.id,
        attempt: 1,
        lessonId,
        verdict: 'accepted',
        grade: 85,
      });
    });

    it('rewrites the card on a second verdict for the same hand-in, instead of posting another', async () => {
      const row = await handIn();
      await service.review(adminId, row.id, { decision: 'accepted', grade: 60, message: 'كويس.' });
      const before = await prisma.conversationMessage.count({ where: { conversation: { userId: studentId } } });

      await service.review(adminId, row.id, { decision: 'accepted', grade: 95, message: 'راجعتها تاني، ممتازة.' });

      const cards = await cardsFor(row.id);
      expect(cards).toHaveLength(1);
      expect(cards[0]!.body).toBe('راجعتها تاني، ممتازة.');
      expect(cards[0]!.card).toMatchObject({ grade: 95, verdict: 'accepted' });
      // «معدّلة» on the bubble — the student is told it changed.
      expect(cards[0]!.editedAt).not.toBeNull();
      expect(await prisma.conversationMessage.count({ where: { conversation: { userId: studentId } } })).toBe(
        before,
      );
      // And the student is still told, even though no new bubble was posted.
      expect(await prisma.notification.count({ where: { userId: studentId, kind: 'homework_reviewed' } })).toBe(2);
    });

    it('gives a resubmission its own card — a new answer, a new verdict', async () => {
      const first = await handIn();
      await service.review(adminId, first.id, { decision: 'needs_work', grade: null, message: 'الخطوة الأخيرة محتاجة مراجعة.' });
      await service.submit(studentId, lessonId, { images: [{ storageKey: storedKey(), sizeBytes: 10 }] });
      await service.review(adminId, first.id, { decision: 'accepted', grade: 100, message: 'تمام.' });

      const cards = await cardsFor(first.id);
      expect(cards.map((message) => message.card)).toMatchObject([
        { attempt: 1, verdict: 'needs_work', grade: null },
        { attempt: 2, verdict: 'accepted', grade: 100 },
      ]);
    });

    it('posts the plain message, with no card, where the feature is closed', async () => {
      cardFeatureOn = false;
      const row = await handIn();
      await service.review(adminId, row.id, { decision: 'accepted', grade: null, message: 'من غير كارت.' });

      expect(await cardsFor(row.id)).toHaveLength(0);
      const last = await prisma.conversationMessage.findFirstOrThrow({
        where: { conversation: { userId: studentId } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(last.body).toBe('من غير كارت.');
      expect(last.card).toBeNull();
    });
  });

  describe('handing in again', () => {
    it('is the same row, one attempt later, with the old pages gone', async () => {
      const firstKey = storedKey();
      await service.submit(studentId, lessonId, { images: [{ storageKey: firstKey, sizeBytes: 1 }] });
      const row = await prisma.homeworkSubmission.findFirstOrThrow({
        where: { userId: studentId, lessonId },
      });
      await service.review(adminId, row.id, {
        decision: 'needs_work',
        grade: null,
        message: 'تفكير تاني في الجزء ده.',
      });

      const secondKey = storedKey();
      const again = await service.submit(studentId, lessonId, {
        images: [{ storageKey: secondKey, sizeBytes: 1 }],
      });

      // ONE row, not two — «كام واجب اتسلّم» must not count the same exercise
      // twice, and the UNIQUE index is what enforces it.
      expect(await prisma.homeworkSubmission.count({ where: { userId: studentId, lessonId } })).toBe(1);
      expect(again.attempt).toBe(2);
      expect(again.status).toBe('submitted');
      // The previous verdict went with the previous answer.
      expect(again.grade).toBeNull();
      expect(again.reviewNote).toBeNull();
      // And the previous attempt's photograph is gone from the bucket.
      expect(objects.has(firstKey)).toBe(false);
      expect(objects.has(secondKey)).toBe(true);
    });

    it('is refused once he has accepted it', async () => {
      await service.submit(studentId, lessonId, { images: [{ storageKey: storedKey(), sizeBytes: 1 }] });
      const row = await prisma.homeworkSubmission.findFirstOrThrow({
        where: { userId: studentId, lessonId },
      });
      await service.review(adminId, row.id, { decision: 'accepted', grade: null, message: 'كله صح.' });

      await expect(
        service.submit(studentId, lessonId, { images: [{ storageKey: storedKey(), sizeBytes: 1 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('typed on the ministry tablet («اكتب الحل»)', () => {
    it('tells the card the option is on for this stack', async () => {
      expect((await service.forStudent(studentId, lessonId))?.typedAnswer).toBe(true);
    });

    it('keeps the text, the tablet it came from, and no pages', async () => {
      const submission = await service.submitText(studentId, lessonId, {
        text: '١- الإجابة ب\n٢- البروتوكول هو HTTPS',
        deviceModel: 'SM-X205',
      });

      expect(submission.status).toBe('submitted');
      expect(submission.imageCount).toBe(0);
      expect(submission.imageIds).toHaveLength(0);
      expect(submission.answerText).toBe('١- الإجابة ب\n٢- البروتوكول هو HTTPS');

      // What he reads on the review screen, and what the queue row says.
      const detail = await service.adminDetail(submission.id);
      expect(detail.answerText).toBe('١- الإجابة ب\n٢- البروتوكول هو HTTPS');
      expect(detail.deviceModel).toBe('SM-X205');
      const list = await service.adminList('pending', courseId, 25, 0, lessonId);
      expect(list.rows.find((row) => row.id === submission.id)?.typed).toBe(true);
    });

    it('refuses a device that is not a Galaxy Tab', async () => {
      // A phone (`SM-S…`) — the option is for the tablet, where photographing a
      // sheet of paper is the clumsy part.
      await expect(
        service.submitText(studentId, lessonId, { text: 'الحل', deviceModel: 'SM-S918B' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await prisma.homeworkSubmission.count({ where: { userId: studentId, lessonId } })).toBe(0);
    });

    it('refuses a draft exercise as a 404, like the photo upload', async () => {
      await expect(
        service.submitText(studentId, unpublishedLessonId, { text: 'الحل', deviceModel: 'SM-X205' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('can follow a photographed attempt, and the old pages go', async () => {
      const photo = storedKey();
      await service.submit(studentId, lessonId, { images: [{ storageKey: photo, sizeBytes: 1 }] });
      const row = await prisma.homeworkSubmission.findFirstOrThrow({ where: { userId: studentId, lessonId } });
      await service.review(adminId, row.id, { decision: 'needs_work', grade: null, message: 'راجع السؤال التاني.' });

      const typed = await service.submitText(studentId, lessonId, { text: 'الحل الجديد', deviceModel: 'SM-T295' });

      expect(typed.attempt).toBe(2);
      expect(typed.imageCount).toBe(0);
      expect(typed.answerText).toBe('الحل الجديد');
      expect(objects.has(photo)).toBe(false);
    });

    it('drops the typed text when the next attempt is photographed', async () => {
      await service.submitText(studentId, lessonId, { text: 'محاولة أولى', deviceModel: 'SM-X205' });
      const row = await prisma.homeworkSubmission.findFirstOrThrow({ where: { userId: studentId, lessonId } });
      await service.review(adminId, row.id, { decision: 'needs_work', grade: null, message: 'ناقص تعريف.' });

      const photographed = await service.submit(studentId, lessonId, {
        images: [{ storageKey: storedKey(), sizeBytes: 1 }],
      });

      expect(photographed.answerText).toBeNull();
      const saved = await prisma.homeworkSubmission.findFirstOrThrow({ where: { userId: studentId, lessonId } });
      expect(saved.deviceModel).toBeNull();
    });
  });

  describe('the thirty-day ceiling', () => {
    it('removes the photographs and leaves the submission standing', async () => {
      const key = storedKey();
      await service.submit(studentId, lessonId, { images: [{ storageKey: key, sizeBytes: 1 }] });
      const row = await prisma.homeworkSubmission.findFirstOrThrow({
        where: { userId: studentId, lessonId },
      });

      // Backdated rather than waiting a month. `submittedAt` is what the sweep
      // reads, and it is the CURRENT attempt's date by design.
      await prisma.homeworkSubmission.update({
        where: { id: row.id },
        data: { submittedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
      });

      expect(await service.purgeExpiredImages(100)).toBe(1);

      const after = await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.imageCount).toBe(1);
      expect(after.imagesPurgedAt).not.toBeNull();
      expect(await prisma.homeworkImage.count({ where: { submissionId: row.id } })).toBe(0);
      expect(objects.has(key)).toBe(false);
    });

    it('leaves a submission from this week alone', async () => {
      const key = storedKey();
      await service.submit(studentId, lessonId, { images: [{ storageKey: key, sizeBytes: 1 }] });

      expect(await service.purgeExpiredImages(100)).toBe(0);
      expect(objects.has(key)).toBe(true);
    });
  });
});
