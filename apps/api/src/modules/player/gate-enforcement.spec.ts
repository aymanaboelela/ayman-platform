// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { PlayerService } from './player.service';

/**
 * The gate, enforced end to end through the real service against a real
 * database — not the pure rule (that is `gate-rule.spec.ts`), but the thing a
 * student actually hits.
 *
 * The claim under test is the founder's headline requirement: a student cannot
 * reach lesson 2 until lesson 1 is done, and cannot reach the exam until
 * everything else is. It matters that this is asserted against
 * `PlayerService.lesson` — the route the browser calls — rather than against
 * the rule in isolation, because a correct rule wired to nothing protects
 * nobody.
 */
describe('progression gate enforcement', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;

  const gate = new LessonGateService(prisma);
  const access = new LessonAccessService(prisma, gate);
  const player = new PlayerService(
    prisma,
    access,
    gate,
    { resolve: (key: string) => `https://media.test/${key}` },
    { getStream: async () => { throw new Error('unused'); }, stat: async () => null } as never,
  );

  const stamp = Date.now().toString(36);
  let userId = '';
  let instructorId = '';
  let courseId = '';
  let courseSlug = '';
  let enrollmentId = '';
  let lessons: string[] = [];
  let examId = '';

  beforeAll(async () => {
    await prisma.$connect();

    userId = (
      await prisma.user.create({
        data: { id: `gate-s-${stamp}`, name: 'طالب', email: `gate-s-${stamp}@t.test` },
      })
    ).id;
    instructorId = (
      await prisma.user.create({
        data: { id: `gate-i-${stamp}`, name: 'مُحاضر', email: `gate-i-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    courseSlug = `gate-course-${stamp}`;
    courseId = (
      await prisma.course.create({
        data: {
          slug: courseSlug,
          title: 'كورس المسار',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          year: 2,
          subjectId: subject.id,
          instructorId,
          progressionMode: 'sequential',
        },
      })
    ).id;

    // Two sections, so the "preceding lesson is course-wide, not
    // section-wide" rule is actually exercised rather than assumed.
    const one = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة الأولى', position: 1, isPublished: true },
    });
    const two = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة الثانية', position: 2, isPublished: true },
    });

    const made: string[] = [];
    for (const [sectionId, title, position] of [
      [one.id, 'الدرس الأول', 1],
      [one.id, 'الدرس التاني', 2],
      [two.id, 'الدرس التالت', 1],
    ] as const) {
      made.push(
        (
          await prisma.lesson.create({
            data: { courseId, sectionId, title, kind: 'text', position, isPublished: true },
          })
        ).id,
      );
    }
    lessons = made;

    examId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: two.id,
          title: 'الامتحان النهائي',
          kind: 'quiz',
          position: 2,
          isPublished: true,
        },
      })
    ).id;
    await prisma.course.update({ where: { id: courseId }, data: { examLessonId: examId } });

    enrollmentId = (await prisma.enrollment.create({ data: { userId, courseId } })).id;
  });

  afterAll(async () => {
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.course.update({ where: { id: courseId }, data: { examLessonId: null } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, instructorId] } } });
    await prisma.$disconnect();
  });

  /** Marks a lesson cleared the way the real completion paths do. */
  async function clear(lessonId: string, state: 'completed' | 'passed' = 'completed') {
    await prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      // `completedVia` is not optional: `lesson_progress_completed_has_source`
      // refuses a completed row that cannot say HOW it completed.
      create: {
        enrollmentId,
        lessonId,
        state,
        completion: 1,
        completedAt: new Date(),
        completedVia: 'manual',
      },
      update: { state, completion: 1, completedAt: new Date(), completedVia: 'manual' },
    });
  }

  it('lets the student open the first lesson', async () => {
    await expect(player.lesson(userId, lessons[0]!)).resolves.toMatchObject({
      lesson: { id: lessons[0] },
    });
  });

  it('REFUSES the second lesson while the first is unfinished', async () => {
    await expect(player.lesson(userId, lessons[1]!)).rejects.toThrow(NotFoundException);
  });

  it('refuses a locked lesson with 404, not 403 — a 403 would confirm it exists', async () => {
    await expect(player.lesson(userId, lessons[2]!)).rejects.toMatchObject({ status: 404 });
  });

  it('opens exactly one more lesson when the first is cleared', async () => {
    await clear(lessons[0]!);

    await expect(player.lesson(userId, lessons[1]!)).resolves.toBeDefined();
    await expect(player.lesson(userId, lessons[2]!)).rejects.toThrow(NotFoundException);
  });

  it('carries the unlock ACROSS a section boundary', async () => {
    await clear(lessons[1]!);
    // lessons[2] is the first lesson of section two.
    await expect(player.lesson(userId, lessons[2]!)).resolves.toBeDefined();
  });

  it('keeps the exam locked even though its predecessor is now cleared', async () => {
    // lessons[2] is cleared below; the exam sits right after it in reading
    // order, so plain sequential order alone would open it here.
    await expect(player.lesson(userId, examId)).rejects.toThrow(NotFoundException);
  });

  it('opens the exam only once every other lesson is cleared', async () => {
    await clear(lessons[2]!);
    await expect(player.lesson(userId, examId)).resolves.toMatchObject({
      lesson: { id: examId },
    });
  });

  it('reports the same lock states through the outline as the routes enforce', async () => {
    // Reset to the start so the outline is asserted against a known shape.
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });

    const outline = await player.outline(userId, courseSlug);
    const flat = outline.sections.flatMap((section) => section.lessons);

    expect(flat.map((lesson) => lesson.gate)).toEqual([
      'available',
      'locked',
      'locked',
      'locked',
    ]);
    expect(outline.examLessonId).toBe(examId);
    expect(outline.progressionMode).toBe('sequential');
    expect(flat.find((lesson) => lesson.id === examId)?.isExam).toBe(true);
  });

  it('draws no locks at all once the course is switched to open', async () => {
    await prisma.course.update({ where: { id: courseId }, data: { progressionMode: 'open' } });
    try {
      const outline = await player.outline(userId, courseSlug);
      const flat = outline.sections.flatMap((section) => section.lessons);
      expect(flat.every((lesson) => lesson.gate === 'available')).toBe(true);

      // And the route agrees — the lock was never a UI concern.
      await expect(player.lesson(userId, lessons[2]!)).resolves.toBeDefined();
    } finally {
      await prisma.course.update({
        where: { id: courseId },
        data: { progressionMode: 'sequential' },
      });
    }
  });

  it('always opens a free-preview lesson, however deep it sits', async () => {
    await prisma.lesson.update({
      where: { id: lessons[2]! },
      data: { isFreePreview: true },
    });
    try {
      await expect(player.lesson(userId, lessons[2]!)).resolves.toBeDefined();
      // …and it still does not unlock what follows it.
      await expect(player.lesson(userId, examId)).rejects.toThrow(NotFoundException);
    } finally {
      await prisma.lesson.update({ where: { id: lessons[2]! }, data: { isFreePreview: false } });
    }
  });

  it('does not leak a locked lesson through the resource route either', async () => {
    const resource = await prisma.lessonResource.create({
      data: {
        lessonId: lessons[1]!,
        kind: 'document',
        title: 'ملف مقفول',
        storageKey: `doc/ab/${randomUUID()}.pdf`,
        filename: 'locked.pdf',
        mime: 'application/pdf',
        sizeBytes: 10,
      },
    });
    try {
      await expect(player.resourceStream(userId, lessons[1]!, resource.id)).rejects.toThrow(
        NotFoundException,
      );
    } finally {
      await prisma.lessonResource.delete({ where: { id: resource.id } });
    }
  });
});
