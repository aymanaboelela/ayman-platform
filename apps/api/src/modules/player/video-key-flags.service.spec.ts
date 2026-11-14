/**
 * «متابعة التنزيل» rows as staff read them: the lecture titles behind the
 * upload ids, how many other days the account was flagged, and the videos no
 * lesson carries any more counted rather than dropped.
 */
import type { PrismaService } from '../../prisma/prisma.service';
import { VideoKeyFlagsService } from './video-key-flags.service';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const GONE = 'c'.repeat(32);

function build() {
  return new VideoKeyFlagsService({
    videoKeyFlag: {
      findMany: async () => [
        {
          id: '019fe0ff-0000-7000-8000-000000000001',
          day: new Date('2026-11-14T00:00:00Z'),
          videos: 3,
          videoIds: [A, B, GONE],
          updatedAt: new Date('2026-11-14T15:30:00Z'),
          userId: 'u1',
          user: { name: 'طالب تجربة', phoneNumber: '+201000000000' },
        },
      ],
      count: async () => 1,
      groupBy: async () => [{ userId: 'u1', _count: { _all: 2 } }],
    },
    lessonVideo: {
      findMany: async () => [
        { externalId: A, lesson: { title: 'الدرس الأول', courseId: 'c1' } },
        { externalId: B, lesson: { title: 'الدرس التاني', courseId: 'c1' } },
      ],
    },
    course: { findMany: async () => [{ id: 'c1', title: 'برمجة تالتة ثانوي' }] },
  } as unknown as PrismaService);
}

describe('VideoKeyFlagsService.list', () => {
  it('names the lectures, counts the account\'s flagged days, and counts the vanished videos', async () => {
    const { rows, rowCount } = await build().list(20, 0);
    expect(rowCount).toBe(1);
    expect(rows[0]).toMatchObject({
      day: '2026-11-14',
      videos: 3,
      studentId: 'u1',
      studentName: 'طالب تجربة',
      phone: '+201000000000',
      flaggedDays: 2,
      unresolved: 1,
      lectures: [
        { lessonTitle: 'الدرس الأول', courseTitle: 'برمجة تالتة ثانوي' },
        { lessonTitle: 'الدرس التاني', courseTitle: 'برمجة تالتة ثانوي' },
      ],
    });
  });
});
