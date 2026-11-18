import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ESSAY_HISTORY_LIMIT,
  ESSAY_IMAGE_RETENTION_DAYS,
  ESSAY_OPEN_DAYS,
  essayIsOpen,
  layEssayDays,
  shiftEssayDay,
  type AdminEssay,
  type AdminEssaySchedule,
  type AdminEssaySubmissionDetail,
  type AdminEssaySubmissionRow,
  type DailyEssayBatchInput,
  type DailyEssayMarkInput,
  type DailyEssaySubmitInput,
  type DailyEssayUpdateInput,
  type EssayPayload,
  type EssayQueueFilter,
  type EssayScheduleFilter,
  type EssayStats,
  type EssaySummary,
  type MyEssaySubmission,
  type StudentEssay,
} from '@ayman/contracts/daily-essay';
import { HOMEWORK_KEY_PATTERN } from '@ayman/contracts/admin/media';
import type { ListResponse } from '@ayman/contracts/admin/list';
import { isFoundationCourse } from '@ayman/contracts/quiz/challenges';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { cairoDayKey } from '../analytics/analytics-shared';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { MediaService, type UploadFile } from '../media/media.service';
import { MEDIA_STORAGE, type MediaStorage } from '../media/storage/media-storage';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * The same private prefix and the same encode as a homework photograph — it is
 * the same object (a phone photo of a handwritten page, read once and then
 * deleted), so it goes through the same pipeline. See `HOMEWORK_ENCODE` in
 * `homework.service.ts` for where the two numbers come from.
 */
const ESSAY_PREFIX = 'hw';
const ESSAY_ENCODE = { width: 1400, quality: 64 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` as the `@db.Date` value Prisma reads and writes (UTC midnight). */
function dateOf(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function keyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The courses a student can open right now, and whether any of them is a real (non-foundation) course. */
interface Audience {
  courseIds: string[];
  /** Holds live access to something beyond the free foundation course — who an
   *  essay with NO course rows is for. */
  general: boolean;
}

/**
 * «السؤال المقالي اليومي».
 *
 * ## Who sees a question
 *
 * A published question whose day has come, addressed to a course the student
 * has LIVE access to (`accessActive`, so a lapsed subscription stops getting
 * new questions) — or addressed to nobody in particular, which means everyone
 * with live access to a real course. The filter is compiled into the query's
 * WHERE, so a question that is not theirs matches zero rows: a 404, never a
 * 403 that would confirm the id exists.
 *
 * An answer the student already handed in stays on their page whatever
 * happens to their access afterwards — it is their work and their mark.
 *
 * ## The model answer is earned
 *
 * It leaves the server for a student only once their own answer is marked, or
 * once the question has stopped taking answers. Never while they could still
 * hand in something copied from it — see `toStudentEssay`.
 *
 * ## Marking deletes the photographs
 *
 * The same rule الواجب lives by, for the same reason: the pictures are the
 * expensive half of the feature, and the record that matters afterwards is
 * the mark, the note and «سلّمت ٣ صور». Unmarked answers lose theirs after
 * `ESSAY_IMAGE_RETENTION_DAYS`.
 */
@Injectable()
export class DailyEssayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: EnrollmentService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /* ── the student's side ────────────────────────────────────────────── */

  async page(userId: string, now: Date = new Date()): Promise<EssayPayload> {
    const today = cairoDayKey(now);
    const audience = await this.audienceOf(userId);

    const rows = await this.prisma.dailyEssay.findMany({
      where: {
        day: { lte: dateOf(today) },
        OR: [this.addressedTo(audience), { submissions: { some: { userId } } }],
      },
      orderBy: [{ day: 'desc' }, { id: 'desc' }],
      // +1 for today's own row, which is lifted out of the list below.
      take: ESSAY_HISTORY_LIMIT + 1,
      select: this.studentSelect(userId),
    });

    const essays = rows.map((row) => toStudentEssay(row, audience, today));
    const todayEssay = essays.find((essay) => essay.day === today) ?? null;

    return {
      day: today,
      today: todayEssay,
      history: essays.filter((essay) => essay !== todayEssay).slice(0, ESSAY_HISTORY_LIMIT),
      stats: await this.stats(userId),
    };
  }

  /**
   * The home card: today's question, else the newest one still taking answers,
   * else the newest one whose mark arrived — so the card has something to say
   * on the morning after, not only on the evening of.
   */
  async summary(userId: string, now: Date = new Date()): Promise<EssaySummary> {
    const today = cairoDayKey(now);
    const audience = await this.audienceOf(userId);

    const rows = await this.prisma.dailyEssay.findMany({
      where: {
        day: { lte: dateOf(today), gt: dateOf(shiftEssayDay(today, -ESSAY_OPEN_DAYS)) },
        OR: [this.addressedTo(audience), { submissions: { some: { userId } } }],
      },
      orderBy: [{ day: 'desc' }, { id: 'desc' }],
      take: 4,
      select: this.studentSelect(userId),
    });
    const essays = rows.map((row) => toStudentEssay(row, audience, today));

    const essay =
      essays.find((entry) => entry.day === today) ??
      essays.find((entry) => entry.open && entry.submission === null) ??
      essays.find((entry) => entry.submission !== null) ??
      null;

    return { essay, stats: await this.stats(userId) };
  }

  /**
   * One page of an answer, stored before the submission that will reference
   * it — the same two-step upload as الواجب, gated HERE as well as at submit
   * so this is not a free image host with a check bolted on afterwards.
   */
  async uploadImage(
    userId: string,
    essayId: string,
    /** Optional so the audience is checked before the payload is. */
    file: UploadFile | undefined,
    now: Date = new Date(),
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    await this.requireOpenEssay(userId, essayId, now);
    if (!file) throw new BadRequestException('no file uploaded');

    const uploaded = await this.media.uploadPrivateImage(file, ESSAY_PREFIX, ESSAY_ENCODE);
    return { storageKey: uploaded.storageKey, sizeBytes: uploaded.sizeBytes };
  }

  /**
   * Hand in — photographs or typed text.
   *
   * One row per (question, student). An answer nobody has marked yet may be
   * REPLACED while the question is still open (the wrong photo, a page left
   * out); a marked one is finished, or a student could swap in the model
   * answer after seeing it.
   */
  async submit(
    userId: string,
    essayId: string,
    input: DailyEssaySubmitInput,
    now: Date = new Date(),
  ): Promise<MyEssaySubmission> {
    const essay = await this.requireOpenEssay(userId, essayId, now);

    if (input.images.length > essay.maxImages) {
      throw new BadRequestException('too many images for this question');
    }
    // The schema proves the SHAPE of a key; only the bucket can say it is a
    // key to something. Checked again against the pattern because this
    // service is what deletes these keys later.
    for (const image of input.images) {
      if (!HOMEWORK_KEY_PATTERN.test(image.storageKey)) {
        throw new BadRequestException('not an answer image');
      }
      if (!(await this.storage.stat(image.storageKey))) {
        throw new BadRequestException('image was not uploaded');
      }
    }

    const existing = await this.prisma.dailyEssaySubmission.findUnique({
      where: { essayId_userId: { essayId, userId } },
      select: { id: true, images: { select: { storageKey: true } } },
    });
    const staleKeys = existing?.images.map((image) => image.storageKey) ?? [];
    // A re-used key (the same staged page handed in twice) must not be
    // deleted as "the previous answer's".
    const kept = new Set(input.images.map((image) => image.storageKey));

    const answer = {
      imageCount: input.images.length,
      answerText: input.images.length > 0 ? null : input.text,
      submittedAt: now,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        const row = existing
          ? await tx.dailyEssaySubmission.update({
              // `status` in the WHERE: a mark that landed between the read
              // above and this write must not be overwritten by a new answer.
              where: { id: existing.id, status: 'submitted' },
              data: { ...answer, imagesPurgedAt: null, images: { deleteMany: {} } },
              select: { id: true },
            })
          : await tx.dailyEssaySubmission.create({
              data: { essayId, userId, ...answer },
              select: { id: true },
            });

        await tx.dailyEssayImage.createMany({
          data: input.images.map((image, index) => ({
            submissionId: row.id,
            storageKey: image.storageKey,
            sizeBytes: image.sizeBytes,
            position: index,
          })),
        });
        /*
         * No notification to the admins, unlike الواجب. A class answering the
         * SAME question on the same evening is hundreds of rows per admin per
         * day, and it tells them nothing the number beside «الأسئلة المقالية»
         * in their sidebar does not.
         */
      });
    } catch (error) {
      // P2002: two tabs handed in at once. P2025: it was marked in between.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2025')
      ) {
        throw new ConflictException({ code: 'essay_already_answered' });
      }
      throw error;
    }

    // OUTSIDE the transaction, and only after it committed — see `deleteObjects`.
    await this.deleteObjects(staleKeys.filter((key) => !kept.has(key)));

    const saved = await this.prisma.dailyEssaySubmission.findUnique({
      where: { essayId_userId: { essayId, userId } },
      select: SUBMISSION_SELECT,
    });
    if (!saved) throw new NotFoundException();
    return toMySubmission(saved);
  }

  /** The bytes of one page, for the student who uploaded it — the owner is in the WHERE. */
  async studentImage(userId: string, imageId: string): Promise<{ key: string; size: number }> {
    const image = await this.prisma.dailyEssayImage.findFirst({
      where: { id: imageId, submission: { userId } },
      select: { storageKey: true, sizeBytes: true },
    });
    if (!image) throw new NotFoundException();
    return { key: image.storageKey, size: image.sizeBytes };
  }

  /* ── the teacher's side: the schedule ──────────────────────────────── */

  async schedule(
    filter: EssayScheduleFilter,
    take: number,
    skip: number,
    now: Date = new Date(),
  ): Promise<AdminEssaySchedule> {
    const today = cairoDayKey(now);
    const where: Prisma.DailyEssayWhereInput =
      filter === 'upcoming'
        ? { day: { gte: dateOf(today) } }
        : filter === 'past'
          ? { day: { lt: dateOf(today) } }
          : {};
    // What is coming reads forwards from today; what has been reads backwards.
    const direction = filter === 'upcoming' ? 'asc' : 'desc';

    const [rows, rowCount, last] = await Promise.all([
      this.prisma.dailyEssay.findMany({
        where,
        orderBy: [{ day: direction }, { id: direction }],
        take,
        skip,
        select: ADMIN_ESSAY_SELECT,
      }),
      this.prisma.dailyEssay.count({ where }),
      this.prisma.dailyEssay.findFirst({ orderBy: { day: 'desc' }, select: { day: true } }),
    ]);

    const counts = await this.countsFor(rows.map((row) => row.id));
    const afterLast = last ? shiftEssayDay(keyOf(last.day), 1) : today;

    return {
      today,
      nextFreeDay: afterLast > today ? afterLast : today,
      rows: rows.map((row) => toAdminEssay(row, counts)),
      rowCount,
    };
  }

  /**
   * «إضافة أسئلة» — the batch laid on consecutive days. One transaction: a
   * batch that half-landed would leave a schedule with a hole nobody can see.
   */
  async createBatch(
    adminId: string,
    input: DailyEssayBatchInput,
  ): Promise<{ created: number; firstDay: string; lastDay: string }> {
    await this.requireCourses(input.courseIds);
    const days = layEssayDays(input.startDay, input.items.length, input.skipWeekdays);
    if (days.length !== input.items.length) throw new BadRequestException('no day left to schedule on');

    const ids = await this.prisma.$transaction(async (tx) => {
      const created: string[] = [];
      for (const [index, item] of input.items.entries()) {
        const row = await tx.dailyEssay.create({
          data: {
            day: dateOf(days[index]!),
            body: item.body,
            modelAnswer: item.modelAnswer,
            maxMarks: item.maxMarks,
            maxImages: input.maxImages,
            isPublished: input.isPublished,
            createdById: adminId,
            courses: { create: input.courseIds.map((courseId) => ({ courseId })) },
          },
          select: { id: true },
        });
        created.push(row.id);
      }
      return created;
    });

    await this.audit.record({
      action: 'essay:create',
      resourceType: AUDIT_RESOURCES.dailyEssay,
      resourceId: ids[0]!,
      outcome: 'success',
      metadata: { count: ids.length, firstDay: days[0], lastDay: days.at(-1), courseIds: input.courseIds },
    });

    return { created: ids.length, firstDay: days[0]!, lastDay: days.at(-1)! };
  }

  async update(id: string, input: DailyEssayUpdateInput): Promise<AdminEssay> {
    if (input.courseIds) await this.requireCourses(input.courseIds);
    const { courseIds, day, ...fields } = input;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.dailyEssay.update({
          where: { id },
          data: { ...fields, ...(day ? { day: dateOf(day) } : {}) },
          select: { id: true },
        });
        if (courseIds) {
          await tx.dailyEssayCourse.deleteMany({ where: { essayId: id } });
          await tx.dailyEssayCourse.createMany({
            data: courseIds.map((courseId) => ({ essayId: id, courseId })),
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException();
      }
      throw error;
    }

    await this.audit.record({
      action: 'essay:update',
      resourceType: AUDIT_RESOURCES.dailyEssay,
      resourceId: id,
      outcome: 'success',
      // The field NAMES, not the text: the words are on the row itself.
      metadata: { fields: Object.keys(input) },
    });

    const row = await this.prisma.dailyEssay.findUnique({ where: { id }, select: ADMIN_ESSAY_SELECT });
    if (!row) throw new NotFoundException();
    return toAdminEssay(row, await this.countsFor([id]));
  }

  /**
   * Delete — only a question nobody has answered. One with answers is a
   * record of what students were asked and marked on; it is HIDDEN
   * (`isPublished: false`) instead, and the FK is RESTRICT so no other path
   * can take it either.
   */
  async remove(id: string): Promise<void> {
    const essay = await this.prisma.dailyEssay.findUnique({
      where: { id },
      select: { id: true, _count: { select: { submissions: true } } },
    });
    if (!essay) throw new NotFoundException();
    if (essay._count.submissions > 0) throw new ConflictException({ code: 'essay_has_answers' });

    await this.prisma.dailyEssay.delete({ where: { id } });
    await this.audit.record({
      action: 'essay:delete',
      resourceType: AUDIT_RESOURCES.dailyEssay,
      resourceId: id,
      outcome: 'success',
    });
  }

  /* ── the teacher's side: marking ───────────────────────────────────── */

  async queue(
    filter: EssayQueueFilter,
    essayId: string | undefined,
    take: number,
    skip: number,
  ): Promise<ListResponse<AdminEssaySubmissionRow>> {
    const where: Prisma.DailyEssaySubmissionWhereInput = {
      ...(filter === 'pending' ? { status: 'submitted' } : {}),
      ...(filter === 'marked' ? { status: 'marked' } : {}),
      ...(essayId ? { essayId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.dailyEssaySubmission.findMany({
        where,
        // The waiting pile is worked OLDEST first — whoever answered first has
        // waited longest. Everything else reads newest first. The id breaks a
        // same-millisecond tie so a paged list never repeats or drops a row.
        orderBy:
          filter === 'pending'
            ? [{ submittedAt: 'asc' }, { id: 'asc' }]
            : [{ submittedAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        select: ROW_SELECT,
      }),
      this.prisma.dailyEssaySubmission.count({ where }),
    ]);

    return { rows: items.map(toRow), rowCount: total };
  }

  async pendingCount(): Promise<number> {
    return this.prisma.dailyEssaySubmission.count({ where: { status: 'submitted' } });
  }

  async detail(id: string): Promise<AdminEssaySubmissionDetail> {
    const row = await this.prisma.dailyEssaySubmission.findUnique({
      where: { id },
      select: {
        ...ROW_SELECT,
        answerText: true,
        reviewNote: true,
        reviewedAt: true,
        images: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true } },
        user: { select: { id: true, name: true, phoneNumber: true } },
        essay: { select: { id: true, day: true, body: true, modelAnswer: true, maxMarks: true } },
      },
    });
    if (!row) throw new NotFoundException();

    const waiting: Prisma.DailyEssaySubmissionWhereInput = { status: 'submitted', id: { not: id } };
    const oldest = [{ submittedAt: 'asc' as const }, { id: 'asc' as const }];
    const [sameQuestion, anyQuestion, pendingCount] = await Promise.all([
      // The same question first: the marker already has its model answer in
      // their head, and thirty answers to one question go faster than thirty
      // answers to thirty.
      this.prisma.dailyEssaySubmission.findFirst({
        where: { ...waiting, essayId: row.essayId },
        orderBy: oldest,
        select: { id: true },
      }),
      this.prisma.dailyEssaySubmission.findFirst({ where: waiting, orderBy: oldest, select: { id: true } }),
      this.pendingCount(),
    ]);

    return {
      ...toRow(row),
      body: row.essay.body,
      modelAnswer: row.essay.modelAnswer,
      imageIds: row.images.map((image) => image.id),
      answerText: row.answerText,
      reviewNote: row.reviewNote,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      studentPhone: row.user.phoneNumber,
      nextPendingId: sameQuestion?.id ?? anyQuestion?.id ?? null,
      pendingCount,
    };
  }

  /** One page, for the marker. `homework:read` IS the authorization. */
  async adminImage(imageId: string): Promise<{ key: string; size: number }> {
    const image = await this.prisma.dailyEssayImage.findUnique({
      where: { id: imageId },
      select: { storageKey: true, sizeBytes: true },
    });
    if (!image) throw new NotFoundException();
    return { key: image.storageKey, size: image.sizeBytes };
  }

  /**
   * The mark — and, in the same transaction, the photographs' rows deleted and
   * the student told.
   *
   * Marking again is allowed (a slip of the finger, a second opinion) and
   * keeps the total the first mark was out of: the student was already told
   * «٧ من ١٠», and a question edited to twenty marks since must not turn the
   * correction into «٨ من ٢٠».
   */
  async mark(adminId: string, id: string, input: DailyEssayMarkInput, now: Date = new Date()): Promise<void> {
    const submission = await this.prisma.dailyEssaySubmission.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        essayId: true,
        maxMarks: true,
        images: { select: { storageKey: true } },
        essay: { select: { maxMarks: true } },
      },
    });
    if (!submission) throw new NotFoundException();

    const outOf = submission.maxMarks ?? submission.essay.maxMarks;
    if (input.mark > outOf) throw new BadRequestException('mark is above the question total');

    const keys = submission.images.map((image) => image.storageKey);

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyEssaySubmission.update({
        where: { id },
        data: {
          status: 'marked',
          mark: input.mark,
          maxMarks: outOf,
          reviewNote: input.note && input.note.length > 0 ? input.note : null,
          reviewedAt: now,
          reviewedById: adminId,
          // The rows go here; the objects after the commit. `imageCount` stays,
          // so the student's card still reads «سلّمت ٣ صور».
          ...(keys.length > 0 ? { imagesPurgedAt: now, images: { deleteMany: {} } } : {}),
        },
      });

      await this.notifications.emit(tx, {
        userId: submission.userId,
        kind: 'essay_marked',
        submissionId: id,
        essayId: submission.essayId,
        mark: input.mark,
        maxMarks: outOf,
      });
    });

    await this.deleteObjects(keys);

    await this.audit.record({
      action: 'essay:mark',
      resourceType: AUDIT_RESOURCES.dailyEssaySubmission,
      resourceId: id,
      outcome: 'success',
      // The note is NOT recorded here — it is on the submission, and a second
      // copy in an append-only log is a second place to read a student's
      // feedback from.
      metadata: { mark: input.mark, maxMarks: outOf, imagesDeleted: keys.length },
    });

    await this.notifications.announce(submission.userId);
  }

  /* ── deleting the bytes ────────────────────────────────────────────── */

  /**
   * The ceiling on an UNMARKED answer's photographs. A marked answer has none
   * left (the rows are gone, so it matches nothing); this is for the answers
   * nobody got to. Returns how many objects went.
   */
  async purgeExpiredImages(batch: number, now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ESSAY_IMAGE_RETENTION_DAYS * DAY_MS);

    const stale = await this.prisma.dailyEssayImage.findMany({
      where: { submission: { submittedAt: { lt: cutoff } } },
      take: batch,
      select: { id: true, storageKey: true, submissionId: true },
    });
    if (stale.length === 0) return 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyEssayImage.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
      await tx.dailyEssaySubmission.updateMany({
        where: { id: { in: [...new Set(stale.map((row) => row.submissionId))] }, imagesPurgedAt: null },
        data: { imagesPurgedAt: now },
      });
    });

    await this.deleteObjects(stale.map((row) => row.storageKey));
    return stale.length;
  }

  /**
   * Rows first, objects second, never inside the transaction — an orphaned
   * object costs storage, a row pointing at deleted bytes is a broken
   * thumbnail on a student's screen. One failure does not stop the rest.
   * Same ordering, and the same reasoning at length, as
   * `HomeworkService.deleteObjects`.
   */
  private async deleteObjects(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      await this.storage.delete(key).catch(() => undefined);
    }
  }

  /* ── shared ────────────────────────────────────────────────────────── */

  private async audienceOf(userId: string): Promise<Audience> {
    const enrollments = await this.enrollments.listOwn(userId);
    const courseIds = enrollments.filter((row) => row.accessActive).map((row) => row.courseId);
    if (courseIds.length === 0) return { courseIds, general: false };

    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { title: true, subtitle: true },
    });
    // The foundation course is free and everyone holds it, so on its own it
    // is not «مشترك» — same exclusion «سؤال اليوم» makes.
    return { courseIds, general: courses.some((course) => !isFoundationCourse(course)) };
  }

  /** Published and addressed to this student. With no live course at all, it matches nothing. */
  private addressedTo(audience: Audience): Prisma.DailyEssayWhereInput {
    return {
      isPublished: true,
      OR: [
        { courses: { some: { courseId: { in: audience.courseIds } } } },
        // `id: { in: [] }` is Prisma's «match nothing» — an empty OR would
        // match everything.
        audience.general ? { courses: { none: {} } } : { id: { in: [] } },
      ],
    };
  }

  private studentSelect(userId: string) {
    return {
      id: true,
      day: true,
      body: true,
      modelAnswer: true,
      maxMarks: true,
      maxImages: true,
      isPublished: true,
      courses: { select: { courseId: true } },
      submissions: { where: { userId }, take: 1, select: SUBMISSION_SELECT },
    } satisfies Prisma.DailyEssaySelect;
  }

  /**
   * The question is this student's and is taking answers right now — and has
   * not been marked for them already. A 404 for every other case: a question
   * that is hidden, not theirs, not yet due or closed is one there is nothing
   * to say about.
   */
  private async requireOpenEssay(
    userId: string,
    essayId: string,
    now: Date,
  ): Promise<{ maxImages: number }> {
    const today = cairoDayKey(now);
    const audience = await this.audienceOf(userId);

    const essay = await this.prisma.dailyEssay.findFirst({
      where: {
        id: essayId,
        day: { lte: dateOf(today), gt: dateOf(shiftEssayDay(today, -ESSAY_OPEN_DAYS)) },
        ...this.addressedTo(audience),
      },
      select: {
        maxImages: true,
        submissions: { where: { userId }, take: 1, select: { status: true } },
      },
    });
    if (!essay) throw new NotFoundException();
    if (essay.submissions[0]?.status === 'marked') {
      throw new ConflictException({ code: 'essay_already_marked' });
    }
    return { maxImages: essay.maxImages };
  }

  private async requireCourses(courseIds: readonly string[]): Promise<void> {
    const unique = [...new Set(courseIds)];
    if (unique.length !== courseIds.length) throw new BadRequestException('duplicate course');
    if (unique.length === 0) return;
    const found = await this.prisma.course.count({ where: { id: { in: unique } } });
    if (found !== unique.length) throw new BadRequestException('unknown course');
  }

  private async stats(userId: string): Promise<EssayStats> {
    const [answered, marked] = await Promise.all([
      this.prisma.dailyEssaySubmission.count({ where: { userId } }),
      this.prisma.dailyEssaySubmission.aggregate({
        where: { userId, status: 'marked' },
        _count: { _all: true },
        _sum: { mark: true, maxMarks: true },
      }),
    ]);
    const earned = Number(marked._sum.mark ?? 0);
    const possible = marked._sum.maxMarks ?? 0;
    return {
      answered,
      marked: marked._count._all,
      averagePercent: possible > 0 ? Math.round((earned / possible) * 1000) / 10 : null,
    };
  }

  /** Answers handed in and answers still waiting, per question — one `groupBy`, never a count per row. */
  private async countsFor(essayIds: readonly string[]): Promise<Map<string, { submitted: number; pending: number }>> {
    const counts = new Map<string, { submitted: number; pending: number }>();
    if (essayIds.length === 0) return counts;

    const groups = await this.prisma.dailyEssaySubmission.groupBy({
      by: ['essayId', 'status'],
      where: { essayId: { in: [...essayIds] } },
      _count: { _all: true },
    });
    for (const group of groups) {
      const entry = counts.get(group.essayId) ?? { submitted: 0, pending: 0 };
      entry.submitted += group._count._all;
      if (group.status === 'submitted') entry.pending += group._count._all;
      counts.set(group.essayId, entry);
    }
    return counts;
  }
}

/* ── selects and mappers ─────────────────────────────────────────────── */

const SUBMISSION_SELECT = {
  id: true,
  status: true,
  imageCount: true,
  answerText: true,
  mark: true,
  maxMarks: true,
  reviewNote: true,
  submittedAt: true,
  reviewedAt: true,
  imagesPurgedAt: true,
  images: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true } },
} satisfies Prisma.DailyEssaySubmissionSelect;

type SubmissionRow = Prisma.DailyEssaySubmissionGetPayload<{ select: typeof SUBMISSION_SELECT }>;

const ADMIN_ESSAY_SELECT = {
  id: true,
  day: true,
  body: true,
  modelAnswer: true,
  maxMarks: true,
  maxImages: true,
  isPublished: true,
  courses: { select: { course: { select: { id: true, title: true } } } },
} satisfies Prisma.DailyEssaySelect;

type AdminEssayRow = Prisma.DailyEssayGetPayload<{ select: typeof ADMIN_ESSAY_SELECT }>;

const ROW_SELECT = {
  id: true,
  status: true,
  imageCount: true,
  answerText: true,
  mark: true,
  maxMarks: true,
  submittedAt: true,
  imagesPurgedAt: true,
  essayId: true,
  user: { select: { id: true, name: true } },
  reviewedBy: { select: { name: true } },
  essay: { select: { day: true, body: true, maxMarks: true } },
} satisfies Prisma.DailyEssaySubmissionSelect;

type QueueRow = Prisma.DailyEssaySubmissionGetPayload<{ select: typeof ROW_SELECT }>;

/** `Decimal | null` → `number | null` — JSON would otherwise send a string. */
function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toMySubmission(row: SubmissionRow): MyEssaySubmission {
  return {
    id: row.id,
    status: row.status,
    imageCount: row.imageCount,
    imageIds: row.images.map((image) => image.id),
    imagesPurged: row.imagesPurgedAt !== null,
    answerText: row.answerText,
    mark: decimalToNumber(row.mark),
    maxMarks: row.maxMarks,
    reviewNote: row.reviewNote,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

/**
 * One question as this student may see it.
 *
 * Exported for the spec: `open` and `modelAnswer` are the two fields with a
 * rule in them. `open` needs the question published, addressed to the student
 * and inside its window; the model answer needs the student's own answer
 * marked, or the question no longer taking answers from them.
 */
export function toStudentEssay(
  row: {
    id: string;
    day: Date;
    body: string;
    modelAnswer: string;
    maxMarks: number;
    maxImages: number;
    isPublished: boolean;
    courses: { courseId: string }[];
    submissions: SubmissionRow[];
  },
  audience: Audience,
  today: string,
): StudentEssay {
  const day = keyOf(row.day);
  const submission = row.submissions[0] ? toMySubmission(row.submissions[0]) : null;
  const addressed =
    row.isPublished &&
    (row.courses.length === 0
      ? audience.general
      : row.courses.some((course) => audience.courseIds.includes(course.courseId)));
  const marked = submission?.status === 'marked';
  const open = addressed && !marked && essayIsOpen(day, today);

  return {
    id: row.id,
    day,
    body: row.body,
    maxMarks: submission?.maxMarks ?? row.maxMarks,
    maxImages: row.maxImages,
    open,
    submission,
    modelAnswer: marked || !open ? row.modelAnswer : null,
  };
}

function toAdminEssay(
  row: AdminEssayRow,
  counts: ReadonlyMap<string, { submitted: number; pending: number }>,
): AdminEssay {
  const count = counts.get(row.id);
  return {
    id: row.id,
    day: keyOf(row.day),
    body: row.body,
    modelAnswer: row.modelAnswer,
    maxMarks: row.maxMarks,
    maxImages: row.maxImages,
    isPublished: row.isPublished,
    courses: row.courses.map((entry) => entry.course),
    submitted: count?.submitted ?? 0,
    pending: count?.pending ?? 0,
  };
}

function toRow(row: QueueRow): AdminEssaySubmissionRow {
  return {
    id: row.id,
    status: row.status,
    imageCount: row.imageCount,
    typed: row.answerText !== null,
    imagesPurged: row.imagesPurgedAt !== null,
    mark: decimalToNumber(row.mark),
    maxMarks: row.maxMarks ?? row.essay.maxMarks,
    submittedAt: row.submittedAt.toISOString(),
    studentId: row.user.id,
    // Resolved at READ time, never stored. An account without a name is an
    // empty string rather than a row that fails to render.
    studentName: row.user.name ?? '',
    essayId: row.essayId,
    essayDay: keyOf(row.essay.day),
    essayExcerpt: (row.essay.body.split('\n')[0] ?? '').slice(0, 140),
    markerName: row.reviewedBy?.name ?? null,
  };
}
