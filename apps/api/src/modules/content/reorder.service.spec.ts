// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonService } from './lesson.service';

describe('LessonService.reorder', () => {
  let prisma: PrismaService;
  let service: LessonService;
  let sectionId: string;
  let otherSectionId: string;
  let userId: string;
  let ids: string[];

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new LessonService(prisma);

    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `ro-${suffix}`, name: 'أ', email: `ro-${suffix}@example.com`, role: 'admin' },
    });
    userId = user.id;
    const offering = await prisma.subjectOffering.findFirstOrThrow({ where: { year: 2 } });
    const course = await prisma.course.create({
      data: {
        slug: `ro-${suffix}`,
        title: 'كورس',
        systemId: offering.systemId,
        year: 2,
        trackId: offering.trackId,
        subjectId: offering.subjectId,
        instructorId: user.id,
      },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'قسم', position: 0 },
    });
    const other = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'قسم آخر', position: 1 },
    });
    sectionId = section.id;
    otherSectionId = other.id;

    ids = [];
    for (let i = 0; i < 40; i += 1) {
      const lesson = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId,
          title: `محاضرة ${i}`,
          kind: 'text',
          position: i,
        },
      });
      ids.push(lesson.id);
    }
    await prisma.lesson.create({
      data: { courseId: course.id, sectionId: otherSectionId, title: 'غريبة', kind: 'text', position: 0 },
    });
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('moves the last lesson to the front and renumbers all 40 contiguously', async () => {
    const moved = [ids[39]!, ...ids.slice(0, 39)];
    const result = await service.reorder(sectionId, moved);
    expect(result.updated).toBe(40);

    const after = await prisma.lesson.findMany({
      where: { sectionId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true, position: true },
    });
    expect(after.map((l) => l.id)).toEqual(moved);
    expect(after.map((l) => l.position)).toEqual(Array.from({ length: 40 }, (_, i) => i));
  });

  it('is reversible and leaves no gaps', async () => {
    await service.reorder(sectionId, ids);
    const positions = (
      await prisma.lesson.findMany({ where: { sectionId }, select: { position: true } })
    ).map((l) => l.position);
    expect(new Set(positions).size).toBe(40);
    expect(Math.min(...positions)).toBe(0);
    expect(Math.max(...positions)).toBe(39);
  });

  it('rejects a partial array', async () => {
    await expect(service.reorder(sectionId, ids.slice(0, 39))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an id belonging to another section', async () => {
    const foreign = await prisma.lesson.findFirstOrThrow({ where: { sectionId: otherSectionId } });
    await expect(
      service.reorder(sectionId, [foreign.id, ...ids.slice(0, 39)]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('leaves the original order intact after a rejected reorder', async () => {
    await service.reorder(sectionId, ids).catch(() => undefined);
    await expect(service.reorder(sectionId, ids.slice(0, 10))).rejects.toThrow();
    const after = await prisma.lesson.findMany({
      where: { sectionId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    expect(after.map((l) => l.id)).toEqual(ids);
  });
});
