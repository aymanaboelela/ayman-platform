import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  HOMEWORK_IMAGE_RETENTION_DAYS,
  type AdminHomeworkDetail,
  type AdminHomeworkRow,
  type HomeworkFilter,
  type HomeworkReviewInput,
  type HomeworkSubmitInput,
  type MyHomeworkSubmission,
  type StudentHomework,
} from '@ayman/contracts/homework';
import { pickHomeworkSuggestions } from '@ayman/contracts/copy/homework';
import type { ListResponse } from '@ayman/contracts/admin/list';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { MediaService, type UploadFile } from '../media/media.service';
import { MEDIA_STORAGE, type MediaStorage } from '../media/storage/media-storage';
import { NotificationsService } from '../notifications/notifications.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { Inject } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

/** Three segments, so the public `GET /media/:prefix/:name` cannot address it. */
const HOMEWORK_PREFIX = 'hw';

/**
 * How a homework photograph is encoded, and why it is not the platform default.
 *
 * Everything else stored here is stored to be LOOKED at and gets 1600px at
 * q82. This is a picture of handwriting, read once by one person and then
 * deleted — «الصورة عشان ما تاخدش مساحات». 1400px still resolves pencil on
 * squared paper at 1× and comfortably at 2× on the review screen; q64 on a
 * photograph of a page (large flat areas, hard edges) lands around 120–200 KB
 * against the 400–700 KB the default produces, and the difference is invisible
 * on the thing being read.
 */
const HOMEWORK_ENCODE = { width: 1400, quality: 64 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * الواجب — the exercise on a lecture, the photographs of the answer, and the
 * instructor's verdict on them.
 *
 * ## Three responsibilities that are really one transaction
 *
 * Handing in, marking, and deleting the bytes are written together on purpose.
 * «أول ما أراجع عليها ووافق… امسحها بقى» is not a cleanup job that runs later;
 * accepting IS the deletion, and a design where the two could diverge would
 * eventually leave a bucket full of accepted answers nobody meant to keep. The
 * only thing that happens outside a transaction is the `storage.delete` calls
 * themselves — see `purgeImages` for why that is both unavoidable and safe.
 *
 * ## Ownership is in the WHERE, never a fetch-then-compare
 *
 * Every student-facing method resolves the lesson through
 * `LessonAccessService`, which compiles `enrollments: { some: { userId } }`
 * into the query — so a lesson that is not theirs matches zero rows rather
 * than being fetched and then rejected. The submission lookups then carry
 * `userId` in their own filter as well, so a submission id belonging to
 * somebody else is a 404 and not a 403: a 403 would confirm the id exists.
 */
@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly access: LessonAccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /* ── the student's side ────────────────────────────────────────────── */

  /**
   * One page of an answer, stored before the submission that will reference it.
   *
   * Two steps rather than one multipart submit, the same shape every other
   * upload on this platform uses: a Next Server Action buffers its whole
   * payload in the web server's memory and is capped at 1 MB, so bytes never
   * travel that way. `submit` re-checks each key against the bucket, because a
   * key that is merely SHAPED right is not a key to anything.
   *
   * The lesson is gated HERE too, not only at submit: an upload endpoint that
   * takes bytes from any signed-in student and only checks the enrolment on
   * the next request is a free image host with an enrolment check bolted on
   * afterwards.
   */
  async uploadImage(
    userId: string,
    lessonId: string,
    /** Optional, because the ENROLMENT is checked before the payload is — see
     *  the controller's own note on why that order matters. */
    file: UploadFile | undefined,
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    await this.requireOpenHomework(userId, lessonId);
    if (!file) throw new BadRequestException('no file uploaded');

    const uploaded = await this.media.uploadPrivateImage(file, HOMEWORK_PREFIX, HOMEWORK_ENCODE);
    return { storageKey: uploaded.storageKey, sizeBytes: uploaded.sizeBytes };
  }

  /**
   * Hand in, or hand in AGAIN after «فكّر أكتر».
   *
   * One row per (lesson, student), rewritten in place — see the model note.
   * A resubmission bumps `attempt`, returns `status` to `submitted`, clears the
   * previous verdict, and deletes the previous attempt's photographs: what he
   * is being asked to look at is the new answer, and keeping the old pages
   * would double the storage this feature exists to bound.
   */
  async submit(
    userId: string,
    lessonId: string,
    input: HomeworkSubmitInput,
  ): Promise<MyHomeworkSubmission> {
    const homework = await this.requireOpenHomework(userId, lessonId);

    if (input.images.length > homework.maxImages) {
      throw new BadRequestException('too many images for this homework');
    }

    // Every key is re-checked against the BUCKET. The schema proves the shape;
    // only the storage can say it is a key to something, and a fabricated one
    // would otherwise become a permanent broken thumbnail on his review screen.
    for (const image of input.images) {
      const stat = await this.storage.stat(image.storageKey);
      if (!stat) throw new BadRequestException('image was not uploaded');
    }

    const existing = await this.prisma.homeworkSubmission.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
      select: { id: true, status: true, attempt: true },
    });

    // A submission he has already accepted is finished. Re-opening it would let
    // a student replace marked work after the mark was given.
    if (existing?.status === 'accepted') {
      throw new BadRequestException('this homework has already been accepted');
    }

    const staleKeys = existing
      ? (
          await this.prisma.homeworkImage.findMany({
            where: { submissionId: existing.id },
            select: { storageKey: true },
          })
        ).map((row) => row.storageKey)
      : [];

    const now = new Date();
    const admins = await this.prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.homeworkSubmission.update({
            where: { id: existing.id },
            data: {
              status: 'submitted',
              attempt: existing.attempt + 1,
              imageCount: input.images.length,
              submittedAt: now,
              // The previous verdict goes with the previous answer. Leaving the
              // old mark on the row would show «مقبول ٧٠» over work he has not
              // read yet.
              grade: null,
              reviewNote: null,
              reviewedAt: null,
              reviewedById: null,
              imagesPurgedAt: null,
              images: { deleteMany: {} },
            },
            select: SUBMISSION_SELECT,
          })
        : await tx.homeworkSubmission.create({
            data: {
              lessonId,
              userId,
              courseId: homework.courseId,
              imageCount: input.images.length,
              submittedAt: now,
            },
            select: SUBMISSION_SELECT,
          });

      await tx.homeworkImage.createMany({
        data: input.images.map((image, index) => ({
          submissionId: row.id,
          storageKey: image.storageKey,
          sizeBytes: image.sizeBytes,
          position: index,
        })),
      });

      /*
       * The admin alert, fanned out to whoever holds `homework:read`.
       *
       * Same shape as `payment_submitted` and `book_order_placed`, and the same
       * reason for an ordinary row rather than only a live event: «هيجيلي أنا
       * الريكويست ده» has to survive nobody having `/admin` open, which at
       * eleven at night is the normal case.
       */
      return this.notifications.emitToPermission(tx, 'homework:read', 'homework_submitted', {
        submissionId: row.id,
        lessonId,
      });
    });

    // OUTSIDE the transaction, and only after it committed — see `deleteObjects`.
    await this.deleteObjects(staleKeys);
    // The live badge and the push. `announceAll` is what wakes a phone with no
    // tab open; the ROW written above is what is still there in the morning.
    await this.notifications.announceAll(admins);

    const saved = await this.prisma.homeworkSubmission.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
      select: SUBMISSION_SELECT,
    });
    // Cannot be null — the transaction above just wrote it — but the type is
    // nullable and inventing a placeholder here would be a worse answer than
    // saying the read failed.
    if (!saved) throw new NotFoundException();
    return toMySubmission(saved);
  }

  /**
   * `forStudent`, with the enrolment gate in front of it.
   *
   * ⚠️ The difference between the two is the whole reason both exist.
   * `forStudent` is called by `PlayerService.lesson` AFTER that endpoint has
   * already run `access.require`, so a second check there would be a second
   * round trip for an answer it holds. This one is what the STANDALONE route
   * calls, and without it `GET /api/homework/lessons/:id` would hand the
   * exercise text of any published lecture to any signed-in account —
   * `forStudent` filters by `isPublished` and by nothing else.
   */
  async mine(userId: string, lessonId: string): Promise<StudentHomework | null> {
    await this.access.require(userId, lessonId);
    return this.forStudent(userId, lessonId);
  }

  /**
   * The homework block on the player, or `null` for a lecture without one.
   *
   * ⚠️ NO access check — see `mine` above. Every caller must have gated the
   * lesson already.
   */
  async forStudent(userId: string, lessonId: string): Promise<StudentHomework | null> {
    const homework = await this.prisma.lessonHomework.findFirst({
      where: { lessonId, isPublished: true },
      select: { body: true, maxImages: true },
    });
    if (!homework) return null;

    const submission = await this.prisma.homeworkSubmission.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
      select: SUBMISSION_SELECT,
    });

    return {
      body: homework.body,
      maxImages: homework.maxImages,
      submission: submission ? toMySubmission(submission) : null,
    };
  }

  /**
   * The bytes of one page, for the student who uploaded it.
   *
   * The owner is in the WHERE — a page belonging to another student's
   * submission matches zero rows, so this cannot be used to walk ids.
   */
  async studentImage(userId: string, imageId: string): Promise<{ key: string; size: number }> {
    const image = await this.prisma.homeworkImage.findFirst({
      where: { id: imageId, submission: { userId } },
      select: { storageKey: true, sizeBytes: true },
    });
    if (!image) throw new NotFoundException();
    return { key: image.storageKey, size: image.sizeBytes };
  }

  /* ── the instructor's side ─────────────────────────────────────────── */

  async adminList(
    filter: HomeworkFilter,
    courseId: string | undefined,
    take: number,
    skip: number,
  ): Promise<ListResponse<AdminHomeworkRow>> {
    const where: Prisma.HomeworkSubmissionWhereInput = {
      ...(filter === 'pending' ? { status: 'submitted' } : {}),
      ...(filter === 'accepted' ? { status: 'accepted' } : {}),
      ...(filter === 'needs_work' ? { status: 'needs_work' } : {}),
      ...(courseId ? { courseId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.homeworkSubmission.findMany({
        where,
        // «اللي مستنّي» first is the whole job, and inside it newest first: a
        // student who handed in tonight is the one still sitting there.
        orderBy: { submittedAt: 'desc' },
        take,
        skip,
        select: ROW_SELECT,
      }),
      this.prisma.homeworkSubmission.count({ where }),
    ]);

    return { rows: items.map(toRow), rowCount: total };
  }

  async pendingCount(): Promise<number> {
    return this.prisma.homeworkSubmission.count({ where: { status: 'submitted' } });
  }

  async adminDetail(id: string): Promise<AdminHomeworkDetail> {
    const row = await this.prisma.homeworkSubmission.findUnique({
      where: { id },
      select: {
        ...ROW_SELECT,
        reviewNote: true,
        reviewedAt: true,
        images: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true } },
        user: { select: { id: true, name: true, phoneNumber: true } },
        lesson: {
          select: {
            id: true,
            title: true,
            homework: { select: { body: true } },
            course: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException();

    return {
      ...toRow(row),
      // The questions he set, so the answer can be read against them without
      // opening the course editor in a second tab.
      prompt: row.lesson.homework?.body ?? '',
      imageIds: row.images.map((image) => image.id),
      reviewNote: row.reviewNote,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      studentPhone: row.user.phoneNumber,
      courseSlug: row.lesson.course.slug,
      // Seeded on the submission's own id, so the three hold still while he is
      // choosing and move for the next student — see `copy/homework.ts`.
      suggestions: pickHomeworkSuggestions(row.id),
    };
  }

  /** One page, for the instructor. No ownership filter — `homework:read` IS the
   *  authorization, exactly as it is for a payment screenshot. */
  async adminImage(imageId: string): Promise<{ key: string; size: number }> {
    const image = await this.prisma.homeworkImage.findUnique({
      where: { id: imageId },
      select: { storageKey: true, sizeBytes: true },
    });
    if (!image) throw new NotFoundException();
    return { key: image.storageKey, size: image.sizeBytes };
  }

  /**
   * «مقبول» or «فكّر أكتر وابعته تاني».
   *
   * Four things happen, and the first three are one transaction: the verdict is
   * written, the words are delivered into the student's own conversation thread
   * — which is where a voice note or a follow-up question then goes, because it
   * is the thread he already reads — and the notification that points at both
   * is emitted. Accepting also deletes the photographs.
   *
   * The message is an ordinary `conversation_messages` row rather than a second
   * messaging system, exactly as «رسايل م. أيمن» is: a student who replies is
   * replying into the inbox he already reads, and there is nothing to keep in
   * sync with anything.
   */
  async review(adminId: string, id: string, input: HomeworkReviewInput): Promise<void> {
    const submission = await this.prisma.homeworkSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        lessonId: true,
        courseId: true,
        status: true,
        images: { select: { storageKey: true } },
      },
    });
    if (!submission) throw new NotFoundException();

    const accepted = input.decision === 'accepted';
    const keys = accepted ? submission.images.map((image) => image.storageKey) : [];
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.homeworkSubmission.update({
        where: { id },
        data: {
          status: input.decision,
          grade: input.grade,
          reviewNote: input.message,
          reviewedAt: now,
          reviewedById: adminId,
          // «امسحها بقى، خلاص الصور مش عايزها بقى خالص» — the row stays, and
          // `imageCount` with it, so the student's card still reads «سلّمت ٣
          // صور · مقبول». Only the pictures go.
          ...(accepted ? { imagesPurgedAt: now, images: { deleteMany: {} } } : {}),
        },
      });

      const conversationId = await threadFor(tx, submission.userId);

      await tx.conversationMessage.create({
        data: { conversationId, author: 'admin', body: input.message },
        select: { id: true },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          // `answered` and `lastMessageAuthor: 'admin'` move together — see the
          // note on `Conversation.lastMessageAuthor`. Writing one without the
          // other is what put his own outbox back on his unread tab.
          status: 'answered',
          lastMessageAt: now,
          lastMessageAuthor: 'admin',
        },
      });

      await this.notifications.emit(tx, {
        userId: submission.userId,
        kind: 'homework_reviewed',
        submissionId: id,
        lessonId: submission.lessonId,
        courseId: submission.courseId,
        homeworkStatus: input.decision,
        grade: input.grade,
      });
    });

    await this.deleteObjects(keys);

    await this.audit.record({
      // No actor here: `AuditContextInterceptor` supplies the user, the IP and
      // the request id from async-local storage for every entry written inside
      // a request, and passing one explicitly would be a second, divergent
      // source for the same fact.
      action: accepted ? 'homework:accept' : 'homework:return',
      resourceType: AUDIT_RESOURCES.homeworkSubmission,
      resourceId: id,
      outcome: 'success',
      // The words are NOT recorded here — they are on the message row and on
      // the submission, and a third copy in an append-only log is a third place
      // for a student's feedback to be read from.
      metadata: { decision: input.decision, grade: input.grade, imagesDeleted: keys.length },
    });

    await this.notifications.announce(submission.userId);
  }

  /* ── deleting the bytes ────────────────────────────────────────────── */

  /**
   * The thirty-day ceiling. «برضه لو بعد ٣٠ يوم في صور شيلها.»
   *
   * Returns how many objects went, so the sweeper can log a number and the spec
   * can assert one. Deliberately not filtered by status: an ACCEPTED submission
   * has already had its images deleted (the rows are gone, so it matches
   * nothing), and everything else — handed back and never redone, or simply
   * never looked at — is exactly what this exists for. Nothing is kept because
   * somebody forgot to do something with it.
   */
  async purgeExpiredImages(batch: number): Promise<number> {
    const cutoff = new Date(Date.now() - HOMEWORK_IMAGE_RETENTION_DAYS * DAY_MS);

    const stale = await this.prisma.homeworkImage.findMany({
      where: { submission: { submittedAt: { lt: cutoff } } },
      take: batch,
      select: { id: true, storageKey: true, submissionId: true },
    });
    if (stale.length === 0) return 0;

    const submissionIds = [...new Set(stale.map((image) => image.submissionId))];

    await this.prisma.$transaction(async (tx) => {
      await tx.homeworkImage.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
      await tx.homeworkSubmission.updateMany({
        // `imagesPurgedAt` only, never `imageCount`: the count is the record
        // that something was handed in, and it is the half the student's card
        // still reads from after the pictures are gone.
        where: { id: { in: submissionIds }, imagesPurgedAt: null },
        data: { imagesPurgedAt: new Date() },
      });
    });

    await this.deleteObjects(stale.map((row) => row.storageKey));
    return stale.length;
  }

  /**
   * Rows first, objects second — and never inside the transaction.
   *
   * A bucket delete cannot be rolled back, so doing it inside the transaction
   * would mean a transaction that fails afterwards leaves rows pointing at
   * bytes that are gone: a permanently broken thumbnail on a student's screen,
   * which is the failure that is actually visible. Doing it after a COMMITTED
   * delete of the rows fails the other way — an orphaned object nobody
   * references, which costs storage and nothing else, and which the next sweep
   * cannot even see. Between "visibly broken" and "invisibly wasteful", this
   * picks the second.
   *
   * One failure does not stop the rest: a key already gone (a retried sweep, a
   * half-finished earlier run) is the ordinary case and must not abort the
   * batch behind it.
   */
  private async deleteObjects(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      await this.storage.delete(key).catch(() => undefined);
    }
  }

  /* ── shared ────────────────────────────────────────────────────────── */

  /**
   * The lesson is this student's, it is open to them, and it carries a
   * PUBLISHED homework.
   *
   * `require`, not `requireOwnership`: uploading an answer to a lecture the
   * progression gate has not opened yet is not a thing to allow, and a lapsed
   * subscription must not keep taking uploads.
   */
  private async requireOpenHomework(
    userId: string,
    lessonId: string,
  ): Promise<{ courseId: string; maxImages: number }> {
    const context = await this.access.require(userId, lessonId);

    const homework = await this.prisma.lessonHomework.findFirst({
      where: { lessonId, isPublished: true },
      select: { maxImages: true },
    });
    // A 404 rather than a 403: an unpublished homework is one the student has
    // not been told about, and saying "it exists but not for you" is a worse
    // answer than "there is nothing here".
    if (!homework) throw new NotFoundException();

    return { courseId: context.courseId, maxImages: homework.maxImages };
  }
}

/* ── selects and mappers ─────────────────────────────────────────────── */

const SUBMISSION_SELECT = {
  id: true,
  status: true,
  attempt: true,
  imageCount: true,
  grade: true,
  reviewNote: true,
  submittedAt: true,
  reviewedAt: true,
  imagesPurgedAt: true,
  images: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, position: true } },
} satisfies Prisma.HomeworkSubmissionSelect;

const ROW_SELECT = {
  id: true,
  status: true,
  attempt: true,
  imageCount: true,
  grade: true,
  submittedAt: true,
  imagesPurgedAt: true,
  courseId: true,
  lessonId: true,
  user: { select: { id: true, name: true } },
  lesson: { select: { title: true, course: { select: { title: true } } } },
} satisfies Prisma.HomeworkSubmissionSelect;

interface SubmissionRow {
  id: string;
  status: 'submitted' | 'accepted' | 'needs_work';
  attempt: number;
  imageCount: number;
  grade: unknown;
  reviewNote: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  imagesPurgedAt: Date | null;
  images: { id: string; position: number }[];
}

/**
 * `Decimal | null` → `number | null`.
 *
 * Prisma hands a `Decimal` back for `@db.Decimal`, and JSON.stringify turns one
 * into a STRING — which a `z.number()` on the client then rejects, on a payload
 * the server believed it had sent correctly. Same conversion the admin course
 * detail makes for `completionPassGrade`, and for the same reason.
 */
function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toMySubmission(row: SubmissionRow): MyHomeworkSubmission {
  return {
    id: row.id,
    status: row.status,
    attempt: row.attempt,
    imageCount: row.imageCount,
    imageIds: row.images.map((image) => image.id),
    imagesPurged: row.imagesPurgedAt !== null,
    grade: decimalToNumber(row.grade),
    reviewNote: row.reviewNote,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

function toRow(row: {
  id: string;
  status: 'submitted' | 'accepted' | 'needs_work';
  attempt: number;
  imageCount: number;
  grade: unknown;
  submittedAt: Date;
  imagesPurgedAt: Date | null;
  courseId: string;
  lessonId: string;
  user: { id: string; name: string | null };
  lesson: { title: string; course: { title: string } };
}): AdminHomeworkRow {
  return {
    id: row.id,
    status: row.status,
    attempt: row.attempt,
    imageCount: row.imageCount,
    imagesPurged: row.imagesPurgedAt !== null,
    grade: decimalToNumber(row.grade),
    submittedAt: row.submittedAt.toISOString(),
    studentId: row.user.id,
    // Resolved at READ time, never stored. An account deleted since is an empty
    // name rather than a row that fails to render.
    studentName: row.user.name ?? '',
    lessonId: row.lessonId,
    lessonTitle: row.lesson.title,
    courseId: row.courseId,
    courseTitle: row.lesson.course.title,
  };
}

/**
 * The student's own thread, created on first contact.
 *
 * A near-copy of `OutreachService.threadFor` rather than a call into it, for
 * the reason `ConversationAttachmentService.ownerWhere` duplicates its own
 * three lines: that method is private, and making it public — or importing the
 * outreach module here — would tie homework marking to a service whose entire
 * subject is the automated messages, complete with its per-day cap and its
 * dedupe ledger. Neither applies to a reply a human just typed.
 *
 * A CLOSED thread is not reused: he closed it deliberately, and appending to it
 * would give the student a message with no reply box under it.
 */
async function threadFor(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string> {
  const existing = await tx.conversation.findFirst({
    where: { userId, origin: 'outreach', status: { not: 'closed' } },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.conversation.create({
    data: { userId, origin: 'outreach', status: 'answered', entryPath: [] },
    select: { id: true },
  });
  return created.id;
}
