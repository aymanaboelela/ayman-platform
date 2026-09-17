import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { copy } from '@ayman/contracts/copy/admin';
import type { HomeworkWriteInput } from '@ayman/contracts/homework';
import type {
  LessonCreateInput,
  LessonResourceInput,
  LessonResourceUpdateInput,
  LessonTextInput,
  LessonUpdateInput,
} from '@ayman/contracts/content';
import type { LessonVideoInput } from '@ayman/contracts/video';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import { PrismaService } from '../../prisma/prisma.service';
import { buildReorderSql } from './reorder.sql';
import { YouTubeDurationService } from './youtube-duration.service';
import { VideoMirrorService } from '../video-mirror/video-mirror.service';

/** Prisma's code for a unique constraint or partial unique index violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

/**
 * What `publish_at` should be, given the two things that decide it.
 *
 * ## Publishing by hand cancels the schedule
 *
 * They are one decision wearing two controls. A lecture switched live now has
 * nothing left to wait for, and a leftover timestamp means the sweeper later
 * finds a row that is "due", publishes what is already published, and writes
 * an audit entry for a change nobody made — noise that reads, in the audit
 * log, exactly like a lecture that published itself unexpectedly.
 *
 * Unpublishing does NOT invent a schedule: `undefined` in means `undefined`
 * out, so a PATCH that only renames a lecture leaves its schedule alone.
 *
 * ⚠️ Returns `undefined` — not `null` — when there is nothing to say, because
 * the caller spreads it into a Prisma `data` object where `null` is a WRITE
 * (clear the column) and `undefined` is an omission.
 */
export function scheduleFor(
  isPublished: boolean | undefined,
  publishAt: string | null | undefined,
): Date | null | undefined {
  if (isPublished === true) return null;
  if (publishAt === undefined) return undefined;
  return publishAt === null ? null : new Date(publishAt);
}

@Injectable()
export class LessonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly youtube: YouTubeDurationService,
    // «النسخة اللي عندنا». Used for two things and nothing else: re-queuing a
    // video whose id changed, and answering «حاول تاني».
    private readonly mirror: VideoMirrorService,
  ) {}

  async create(sectionId: string, input: LessonCreateInput) {
    // courseId is read from the section, never accepted from the client. The
    // composite FK (lessons_section_matches_course) makes a mismatch impossible
    // at the database level too.
    const section = await this.prisma.courseSection.findUnique({
      where: { id: sectionId },
      select: { id: true, courseId: true },
    });
    if (!section) throw new NotFoundException();

    const last = await this.prisma.lesson.findFirst({
      where: { sectionId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    const lesson = await this.prisma.lesson.create({
      data: {
        sectionId,
        courseId: section.courseId,
        title: input.title,
        kind: input.kind,
        isPublished: input.isPublished,
        isFreePreview: input.isFreePreview,
        forGeneral: input.forGeneral,
        forLanguages: input.forLanguages,
        estimatedSeconds: input.estimatedSeconds,
        completionMode: input.completionMode,
        completionMinViewSeconds: input.completionMinViewSeconds,
        completionPassGrade: input.completionPassGrade,
        publishAt: scheduleFor(input.isPublished, input.publishAt),
        description: input.description,
        position: last === null ? 0 : last.position + 1,
      },
    });

    await this.audit.record({
      action: 'lesson:create',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lesson.id,
      outcome: 'success',
      metadata: { sectionId, courseId: section.courseId, title: lesson.title },
    });

    return lesson;
  }

  async update(id: string, input: LessonUpdateInput) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id }, select: { id: true } });
    if (!lesson) throw new NotFoundException();
    const updated = await this.prisma.lesson.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.isPublished !== undefined && { isPublished: input.isPublished }),
        ...(input.isFreePreview !== undefined && { isFreePreview: input.isFreePreview }),
        ...(input.forGeneral !== undefined && { forGeneral: input.forGeneral }),
        ...(input.forLanguages !== undefined && { forLanguages: input.forLanguages }),
        ...(input.estimatedSeconds !== undefined && { estimatedSeconds: input.estimatedSeconds }),
        ...(input.completionMode !== undefined && { completionMode: input.completionMode }),
        ...(input.completionMinViewSeconds !== undefined && {
          completionMinViewSeconds: input.completionMinViewSeconds,
        }),
        ...(input.completionPassGrade !== undefined && {
          completionPassGrade: input.completionPassGrade,
        }),
        ...(input.description !== undefined && { description: input.description }),
        /*
         * The schedule and the switch are ONE decision, so they are resolved
         * together rather than written independently.
         *
         * Publishing by hand cancels the schedule: a lecture that is already
         * live has nothing left to wait for, and leaving the timestamp behind
         * means the sweeper finds a row that is due, publishes what is already
         * published, and writes an audit entry for a change nobody made. That
         * is what `scheduleFor` settles — see its own note.
         */
        ...((input.publishAt !== undefined || input.isPublished !== undefined) && {
          publishAt: scheduleFor(input.isPublished, input.publishAt),
        }),
      },
    });

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: id,
      outcome: 'success',
      metadata: { changed: Object.keys(input) },
    });

    return updated;
  }

  private async assertKind(lessonId: string, kind: 'video' | 'text' | 'attachment') {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, kind: true },
    });
    if (!lesson) throw new NotFoundException();
    if (lesson.kind !== kind) {
      throw new BadRequestException(`lesson ${lessonId} is a ${lesson.kind} lesson, not ${kind}`);
    }
    return lesson;
  }

  /**
   * `input.externalId` is already an 11-character id — LessonVideoInputSchema
   * transformed the URL away before this method could see it. Nothing here
   * parses, reconstructs, or fetches anything.
   */
  /**
   * The duration is RESOLVED here, not required from the caller.
   *
   * The admin pastes a link and saves; how long the video runs is YouTube's
   * fact about its own video, and asking a human to transcribe it is asking
   * them to be a slower, less accurate copy of this request. The client may
   * still state a number — a browser probe that already succeeded, or a hand
   * typed fallback — and a stated number always wins, because it is the only
   * escape hatch for a video YouTube will not answer for at all.
   */
  async setVideo(lessonId: string, input: LessonVideoInput) {
    await this.assertKind(lessonId, 'video');

    /*
     * The duration ALREADY STORED for this same video is the third source, and
     * it is what stops an unrelated edit destroying a lecture.
     *
     * Every write to this row re-resolved the duration, so a save that changed
     * only the POSTER re-asked YouTube — and a datacenter IP is often served
     * the bot challenge instead of the video. The 422 that followed rejected
     * the whole write, so the image the instructor had just uploaded was never
     * stored: «المفروض أنا ضايف صورة ودلوقتي بجيبها مش ظاهرة».
     *
     * If the id has not changed, the number already in the row IS this video's
     * duration. Re-deriving it was never the point of saving a poster.
     */
    // `== null`, covering BOTH — `LessonVideoInputSchema` normalises an absent
    // duration to `null` (video.ts: `value.durationSeconds ?? null`), so an
    // `=== undefined` test here would never once have fired.
    //
    // Read UNCONDITIONALLY now, where it used to be skipped whenever a
    // duration was supplied. The row answers a second question the mirror
    // added — «هو ده نفس الفيديو؟» — and that one has to be asked on every
    // write, including the ones that carry a duration. It is a primary-key
    // lookup; the reason it was conditional was never its cost, it was the
    // YouTube call it used to guard.
    const stored = await this.prisma.lessonVideo.findUnique({
      where: { lessonId },
      select: { externalId: true, durationSeconds: true },
    });
    const sameVideo = stored !== null && stored.externalId === input.externalId;
    const keptDuration = sameVideo ? stored.durationSeconds : null;

    /*
     * A new id means our copy is a copy of something else.
     *
     * `mirrorStatus` lives on the LESSON's video row while the bytes in the
     * bucket are keyed by the YOUTUBE ID, so an instructor swapping in a
     * re-cut lecture would otherwise leave a row saying `ready` and a player
     * building a playlist URL for an id nothing was ever uploaded under. The
     * student's request 404s, hls.js reports fatal, and the component falls
     * back to YouTube — so it self-heals, and self-heals into exactly the
     * blocked-tablet failure this feature was built to end.
     *
     * Re-queuing instead costs one more pass of a worker that is idle almost
     * all the time.
     */
    const mirrorReset = sameVideo
      ? {}
      : {
          mirrorStatus: 'pending' as const,
          mirrorHeight: null,
          mirrorBytes: null,
          mirrorError: null,
          mirrorAttempts: 0,
          mirrorAt: null,
        };

    const durationSeconds =
      input.durationSeconds ?? keptDuration ?? (await this.youtube.durationOf(input.externalId));
    if (durationSeconds === null) {
      // 422, not 500: nothing is broken here — this particular video would not
      // say. The message has to name that, or it reads as "saving is down".
      throw new UnprocessableEntityException(copy.admin.lesson.durationUnavailable);
    }

    return this.prisma.lessonVideo.upsert({
      where: { lessonId },
      create: {
        lessonId,
        provider: input.provider,
        externalId: input.externalId,
        durationSeconds,
        posterKey: input.posterKey,
      },
      update: {
        provider: input.provider,
        externalId: input.externalId,
        durationSeconds,
        posterKey: input.posterKey,
        ...mirrorReset,
      },
    });
  }

  /**
   * Reset the mirror state so the worker picks this video up again.
   *
   * Returns the status it has been set to rather than a bare 204, so the admin
   * screen can render the change without a second request — and so a caller
   * on a deployment with no bucket gets `disabled` back and an honest answer
   * instead of a queued job nothing will ever run.
   */
  async remirrorVideo(lessonId: string): Promise<{ lessonId: string; mirrorStatus: string }> {
    await this.assertKind(lessonId, 'video');
    if (!this.mirror.enabled) return { lessonId, mirrorStatus: 'disabled' };
    await this.mirror.requeue(lessonId);
    return { lessonId, mirrorStatus: 'pending' };
  }

  async removeVideo(lessonId: string): Promise<{ lessonId: string }> {
    await this.assertKind(lessonId, 'video');
    await this.prisma.lessonVideo.delete({ where: { lessonId } }).catch(() => undefined);
    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
      metadata: { operation: 'removeVideo' },
    });
    return { lessonId };
  }

  /** Sanitized on WRITE. The stored row is safe even if a future renderer is not. */
  async setText(lessonId: string, input: LessonTextInput) {
    await this.assertKind(lessonId, 'text');
    const bodyHtml = sanitizeRichText(input.bodyHtml);
    return this.prisma.lessonText.upsert({
      where: { lessonId },
      create: { lessonId, bodyHtml },
      update: { bodyHtml },
    });
  }

  /**
   * الواجب — set or rewrite the exercise on this lecture.
   *
   * ⚠️ NOT `assertKind`-gated, and for the same reason `addResource` below is
   * not: homework hangs off ANY lesson kind, and the common case is a VIDEO
   * lecture that also asks for a worked solution. A kind gate here would
   * recreate exactly the mistake `LessonResource`'s model comment records.
   *
   * An upsert rather than create/update, so the autosaving editor does not have
   * to know whether it is writing the first version — the same shape `setText`
   * uses one method up.
   */
  async setHomework(lessonId: string, input: HomeworkWriteInput) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException();

    const homework = await this.prisma.lessonHomework.upsert({
      where: { lessonId },
      create: {
        lessonId,
        body: input.body,
        maxImages: input.maxImages,
        isPublished: input.isPublished,
      },
      update: {
        body: input.body,
        maxImages: input.maxImages,
        isPublished: input.isPublished,
      },
    });

    await this.audit.record({
      action: 'lesson:set-homework',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
      // The questions themselves are not recorded: they are the lecture's
      // content and they live on the row, which the editor reads back.
      metadata: { isPublished: input.isPublished, maxImages: input.maxImages },
    });

    return homework;
  }

  /**
   * «شيل الواجب».
   *
   * ⚠️ Submissions are NOT touched. They hang off the LESSON, not off
   * `lesson_homework`, so removing the exercise leaves every answer standing —
   * which is the point: what a student handed in is a record of something they
   * did, and it survives the instructor changing his mind about the question.
   * The 30-day sweep is what eventually takes the photographs, as it does for
   * everything else.
   *
   * Idempotent: removing an exercise that is not there answers the same 204 as
   * removing one that is, so a double-tap on a slow connection is not an error.
   */
  async removeHomework(lessonId: string): Promise<{ lessonId: string }> {
    await this.prisma.lessonHomework.deleteMany({ where: { lessonId } });

    await this.audit.record({
      action: 'lesson:remove-homework',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
    });

    return { lessonId };
  }

  /**
   * ⚠️ Deliberately NOT `assertKind`-gated, unlike `setVideo` and `setText`.
   *
   * Resources are not a lesson body — they are the material set that hangs off
   * any lesson, and the common case is precisely a VIDEO lesson carrying the
   * presentation it was taught from plus a few materials. The predecessor
   * `addAttachment` required `kind === 'attachment'`, which is exactly why
   * materials could not be attached to the lessons that most needed them.
   */
  async addResource(lessonId: string, input: LessonResourceInput) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException();

    const last = await this.prisma.lessonResource.findFirst({
      where: { lessonId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    /*
     * `lesson_resources_one_presentation` is a partial UNIQUE INDEX — one
     * «بريزنتيشن أساسي» per lecture — and it had no voice above the database.
     *
     * A second one raised P2002, nothing caught it, and the instructor was
     * shown `POST /api/admin/lessons/…/resources failed with 500:
     * {"statusCode":500,…}` inside an RTL panel: unreadable, unactionable, and
     * indistinguishable from the platform being broken. The rule is correct and
     * deliberate ("the main presentation" only means anything if there is one);
     * it just needed to arrive as a sentence and a 409.
     */
    const resource = await this.prisma.lessonResource
      .create({
        data: {
          lessonId,
          kind: input.kind,
          title: input.title,
          description: input.description,
          storageKey: input.storageKey,
          filename: input.filename,
          mime: input.mime,
          sizeBytes: input.sizeBytes,
          videoProvider: input.videoProvider,
          videoExternalId: input.videoExternalId,
          linkUrl: input.linkUrl,
          position: last === null ? 0 : last.position + 1,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException(copy.admin.resource.presentationExists);
        }
        throw error;
      });

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
      metadata: { operation: 'addResource', resourceId: resource.id, kind: input.kind },
    });

    return resource;
  }

  /** Title and description only — see `LessonResourceUpdateSchema` for why a
   *  kind change is a delete plus a create rather than a PATCH. */
  async updateResource(id: string, input: LessonResourceUpdateInput) {
    const existing = await this.prisma.lessonResource.findUnique({
      where: { id },
      select: { id: true, lessonId: true },
    });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.lessonResource.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: existing.lessonId,
      outcome: 'success',
      metadata: { operation: 'updateResource', resourceId: id, changed: Object.keys(input) },
    });

    return updated;
  }

  async removeResource(id: string): Promise<{ id: string }> {
    const resource = await this.prisma.lessonResource.findUnique({
      where: { id },
      select: { id: true, lessonId: true },
    });
    if (!resource) throw new NotFoundException();

    await this.prisma.lessonResource.delete({ where: { id } });
    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      // The LESSON is the audited resource — `id` is the row that went away,
      // and a trail keyed on a deleted row's own id is not navigable.
      resourceId: resource.lessonId,
      outcome: 'success',
      metadata: { operation: 'removeResource', resourceId: id },
    });
    return { id };
  }

  /**
   * Same contract as `reorder` above: the FULL ordered array, and the server
   * verifies the submitted set is exactly this lesson's current set before it
   * rewrites anything. The set check is what stops an array carrying one id
   * from another lesson from revealing, through the row count, that it exists.
   */
  async reorderResources(lessonId: string, orderedIds: string[]): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.lessonResource.findMany({
        where: { lessonId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((row) => row.id));

      if (orderedIds.length !== currentIds.size) {
        throw new BadRequestException(
          'the ordered array must contain every resource of the lesson',
        );
      }
      for (const id of orderedIds) {
        if (!currentIds.has(id)) {
          throw new BadRequestException('the ordered array contains an id from another lesson');
        }
      }

      const updated = await tx.$executeRaw(
        buildReorderSql('lesson_resources', 'lesson_id', lessonId, orderedIds),
      );
      if (updated !== orderedIds.length) {
        throw new BadRequestException('reorder touched an unexpected number of rows');
      }

      await this.audit.record({
        action: 'lesson:reorder',
        resourceType: AUDIT_RESOURCES.lesson,
        resourceId: lessonId,
        outcome: 'success',
        metadata: { operation: 'reorderResources', orderedIds },
      });

      return { updated };
    });
  }

  /**
   * Refuses when the lesson carries student attempts, mirroring
   * `CourseService.remove`.
   *
   * The cascade is Lesson → Quiz → QuizAttempt → AttemptEvent, and it fails in
   * TWO different ways depending on how far the student got:
   *
   *   - an attempt with events → `attempt_events` has a BEFORE DELETE trigger
   *     that raises unconditionally (and DELETE revoked from `ayman_runtime`),
   *     so the transaction aborts and the admin gets a 500 assembled from a
   *     Postgres error string.
   *   - an attempt with no events yet → nothing objects, and the student's
   *     attempt row is destroyed silently. Verified, not assumed: without this
   *     guard `remove` resolved and took the attempt with it.
   *
   * The second is the worse one, and it is the one no database constraint was
   * ever going to catch.
   *
   * The refusal is PERMANENT — attempt history is never removable, so no
   * sequence of admin actions makes this delete succeed later. The Arabic copy
   * therefore points at unpublishing, which takes the lesson away from every
   * student without touching what they already did.
   */
  async remove(id: string): Promise<{ id: string }> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      select: { id: true, sectionId: true, position: true },
    });
    if (!lesson) throw new NotFoundException();

    const attemptCount = await this.prisma.quizAttempt.count({
      where: { quiz: { lessonId: id } },
    });
    if (attemptCount > 0) {
      throw new ConflictException({
        code: 'lesson_has_attempts',
        message:
          'this lesson has student quiz attempts and can never be hard-deleted; unpublish it instead',
      });
    }

    await this.prisma.$transaction([
      this.prisma.lesson.delete({ where: { id } }),
      this.prisma.lesson.updateMany({
        where: { sectionId: lesson.sectionId, position: { gt: lesson.position } },
        data: { position: { decrement: 1 } },
      }),
    ]);
    await this.audit.record({
      action: 'lesson:delete',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: id,
      outcome: 'success',
      metadata: { sectionId: lesson.sectionId },
    });
    return { id };
  }

  /**
   * The client sends the FULL ordered array, debounced. The server verifies the
   * submitted set is exactly the section's current set — no additions, no
   * removals, no ids borrowed from another section — and then rewrites every
   * position in one statement.
   *
   * The set check is what stops the interesting attack: a PATCH whose array
   * contains 39 of this section's lessons plus one from a course the caller
   * cannot see would otherwise silently re-parent nothing but reveal, through
   * the row count, that the foreign id exists.
   */
  async reorder(sectionId: string, orderedIds: string[]): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.lesson.findMany({
        where: { sectionId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((lesson) => lesson.id));

      if (orderedIds.length !== currentIds.size) {
        throw new BadRequestException('the ordered array must contain every lesson in the section');
      }
      for (const id of orderedIds) {
        if (!currentIds.has(id)) {
          throw new BadRequestException('the ordered array contains an id from another section');
        }
      }

      const updated = await tx.$executeRaw(
        buildReorderSql('lessons', 'section_id', sectionId, orderedIds),
      );
      if (updated !== orderedIds.length) {
        // Cannot happen given the set check above — but if it ever does, the
        // transaction rolls back rather than leaving a partial order.
        throw new BadRequestException('reorder touched an unexpected number of rows');
      }

      // Order IS the payload here, which is why `canonicalise` preserves array
      // order: the ids alone would not reconstruct what changed.
      await this.audit.record({
        action: 'lesson:reorder',
        resourceType: AUDIT_RESOURCES.lesson,
        resourceId: sectionId,
        outcome: 'success',
        metadata: { orderedIds },
      });

      return { updated };
    });
  }
}
