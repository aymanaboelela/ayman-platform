import { Injectable } from '@nestjs/common';
import type { ListResponse } from '@ayman/contracts/admin/list';
import type { VideoKeyFlagLecture, VideoKeyFlagRow, VideoKeyFlagSummary } from '@ayman/contracts/admin/video-key-flags';
import { PrismaService } from '../../prisma/prisma.service';

/** `YYYY-MM-DD` in Cairo — the same day `VideoKeyWatchService` writes. */
function cairoDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now);
}

function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Reads `video_key_flags` for «متابعة التنزيل». Newest day first; within a
 * day, the account that took a lecture most recently first.
 *
 * Lecture titles are resolved on read from `lesson_videos` → lessons →
 * courses, in three queries a page whatever its size, so a lecture renamed
 * since reads renamed. An id no lesson carries any more (the video was
 * replaced or archived) is simply not listed — `videos` still counts it.
 */
@Injectable()
export class VideoKeyFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(now = new Date()): Promise<VideoKeyFlagSummary> {
    const today = cairoDay(now);
    const weekAgo = cairoDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    const [todayCount, weekCount, repeats] = await Promise.all([
      this.prisma.videoKeyFlag.count({ where: { day: asDate(today) } }),
      this.prisma.videoKeyFlag.count({ where: { day: { gte: asDate(weekAgo) } } }),
      this.prisma.videoKeyFlag.groupBy({ by: ['userId'], having: { userId: { _count: { gt: 1 } } } }),
    ]);
    return { today: todayCount, last7Days: weekCount, repeatAccounts: repeats.length };
  }

  async list(take: number, skip: number): Promise<ListResponse<VideoKeyFlagRow>> {
    const [rows, rowCount] = await Promise.all([
      this.prisma.videoKeyFlag.findMany({
        orderBy: [{ day: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        select: {
          id: true,
          day: true,
          videos: true,
          videoIds: true,
          updatedAt: true,
          userId: true,
          user: { select: { name: true, phoneNumber: true } },
        },
      }),
      this.prisma.videoKeyFlag.count(),
    ]);
    if (rows.length === 0) return { rows: [], rowCount };

    const userIds = [...new Set(rows.map((row) => row.userId))];
    const perUser = await this.prisma.videoKeyFlag.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    });
    const flaggedDays = new Map(perUser.map((entry) => [entry.userId, entry._count._all]));

    const lectures = await this.lectures([...new Set(rows.flatMap((row) => row.videoIds))]);

    return {
      rowCount,
      rows: rows.map((row) => ({
        id: row.id,
        day: row.day.toISOString().slice(0, 10),
        videos: row.videos,
        studentId: row.userId,
        studentName: row.user.name,
        phone: row.user.phoneNumber,
        flaggedDays: flaggedDays.get(row.userId) ?? 1,
        updatedAt: row.updatedAt.toISOString(),
        lectures: row.videoIds.flatMap((id) => lectures.get(id) ?? []),
        unresolved: row.videoIds.filter((id) => !lectures.has(id)).length,
      })),
    };
  }

  /** Upload id → the lecture(s) carrying it. One video can sit on two lessons. */
  private async lectures(videoIds: string[]): Promise<Map<string, VideoKeyFlagLecture[]>> {
    const out = new Map<string, VideoKeyFlagLecture[]>();
    if (videoIds.length === 0) return out;
    const videos = await this.prisma.lessonVideo.findMany({
      where: { externalId: { in: videoIds }, provider: 'upload' },
      select: { externalId: true, lesson: { select: { title: true, courseId: true } } },
    });
    const courseIds = [...new Set(videos.map((video) => video.lesson.courseId))];
    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true },
    });
    const courseTitle = new Map(courses.map((course) => [course.id, course.title]));
    for (const video of videos) {
      const list = out.get(video.externalId) ?? [];
      list.push({ lessonTitle: video.lesson.title, courseTitle: courseTitle.get(video.lesson.courseId) ?? '' });
      out.set(video.externalId, list);
    }
    return out;
  }
}
