import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UPLOAD_ID_RE } from '@ayman/contracts/video';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { userHasPermission } from '../../auth/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { VideoMirrorService } from '../video-mirror/video-mirror.service';

/**
 * Who may have an uploaded lecture's key — see `video-mirror/video-key.ts`.
 *
 * The same people who may watch it, decided by the same code: a student is
 * handed the key if ANY lesson using this video passes
 * `LessonAccessService.requireEntitled` — enrollment, publication, a live
 * grant, the term and the month, and «فتح بكود» — which is what the player
 * page itself went through a moment earlier. `requireEntitled` and not
 * `require`: the progression gate can move under a student mid-lecture (an
 * admin publishes the lesson before it), and a lecture that stops decrypting
 * halfway through is not a lock, it is a broken player.
 *
 * Staff who can read unpublished courses get every key, so the course editor's
 * preview plays what it previews.
 *
 * Every refusal is the same 404, for the reason `LessonAccessService` gives
 * for its own: a 403 would confirm to anyone iterating ids that the video
 * exists.
 */
@Injectable()
export class VideoKeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
    private readonly mirror: VideoMirrorService,
  ) {}

  async key(user: Pick<AuthenticatedUser, 'id' | 'role'>, videoId: string): Promise<Buffer> {
    if (!UPLOAD_ID_RE.test(videoId)) throw new NotFoundException('video not found');

    const rows = await this.prisma.lessonVideo.findMany({
      where: { externalId: videoId, provider: 'upload' },
      select: { lessonId: true },
    });
    if (rows.length === 0) throw new NotFoundException('video not found');

    if (userHasPermission(user.id, user.role, 'course:read-admin')) {
      return this.mirror.videoKey(videoId);
    }

    for (const { lessonId } of rows) {
      try {
        await this.access.requireEntitled(user.id, lessonId);
        return this.mirror.videoKey(videoId);
      } catch (error) {
        // Not this lesson — the next one using the same video may be theirs.
        if (error instanceof NotFoundException || error instanceof ForbiddenException) continue;
        throw error;
      }
    }
    throw new NotFoundException('video not found');
  }
}
