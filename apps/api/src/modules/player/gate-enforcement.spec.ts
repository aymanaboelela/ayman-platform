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
 * Two claims, and it matters that both are asserted against
 * `PlayerService.lesson` — the route the browser calls — rather than against
 * the rule in isolation, because a correct rule wired to nothing protects
 * nobody, and a rule that has been RELAXED in one place and not the other
 * leaves a padlock in the outline over a lesson that opens fine:
 *
 *   · every lecture and every lecture quiz opens, in any order, from the day
 *     the student enrols
 *   · the final exam does not, until every lecture is cleared
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
  let lectureQuizId = '';
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
        },
      })
    ).id;

    // Two sections, so "the run is the whole course flattened" is actually
    // exercised rather than assumed — the exam counts lectures across section
    // boundaries, and a one-section fixture could not tell the difference.
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

    // A LECTURE quiz, not the exam. It is here to pin the half of the change
    // that is easiest to half-do: a quiz used to wait on the lecture above it,
    // and it no longer does.
    lectureQuizId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: two.id,
          title: 'كويز الدرس التالت',
          kind: 'quiz',
          position: 2,
          isPublished: true,
        },
      })
    ).id;

    examId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: two.id,
          title: 'الامتحان النهائي',
          kind: 'quiz',
          position: 3,
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

  it('opens the SECOND lesson with the first untouched', async () => {
    // The headline of this change. This threw `NotFoundException` for the
    // whole life of the sequential chain.
    await expect(player.lesson(userId, lessons[1]!)).resolves.toMatchObject({
      lesson: { id: lessons[1] },
    });
  });

  it('opens a lesson in a LATER section with nothing at all cleared', async () => {
    await expect(player.lesson(userId, lessons[2]!)).resolves.toBeDefined();
  });

  it('opens a lecture quiz before its own lecture is finished', async () => {
    await expect(player.lesson(userId, lectureQuizId)).resolves.toBeDefined();
  });

  it('REFUSES the exam while lectures are still unfinished', async () => {
    await expect(player.lesson(userId, examId)).rejects.toThrow(NotFoundException);
  });

  it('refuses the locked exam with 404, not 403 — a 403 would confirm it exists', async () => {
    await expect(player.lesson(userId, examId)).rejects.toMatchObject({ status: 404 });
  });

  it('does not leak the locked exam through the resource route either', async () => {
    const resource = await prisma.lessonResource.create({
      data: {
        lessonId: examId,
        kind: 'document',
        title: 'ملف مقفول',
        storageKey: `doc/ab/${randomUUID()}.pdf`,
        filename: 'locked.pdf',
        mime: 'application/pdf',
        sizeBytes: 10,
      },
    });
    try {
      await expect(player.resourceStream(userId, examId, resource.id)).rejects.toThrow(
        NotFoundException,
      );
    } finally {
      await prisma.lessonResource.delete({ where: { id: resource.id } });
    }
  });

  it('reports the same states through the outline as the routes enforce', async () => {
    const outline = await player.outline(userId, courseSlug);
    const flat = outline.sections.flatMap((section) => section.lessons);

    // Three lectures, then the lecture quiz, then the exam — the only lock.
    expect(flat.map((lesson) => lesson.gate)).toEqual([
      'available',
      'available',
      'available',
      'available',
      'locked',
    ]);
    expect(outline.examLessonId).toBe(examId);
    expect(flat.find((lesson) => lesson.id === examId)?.isExam).toBe(true);
  });

  it('still keeps the exam shut when only the lecture BEFORE it is cleared', async () => {
    await clear(lessons[2]!);
    await expect(player.lesson(userId, examId)).rejects.toThrow(NotFoundException);
  });

  it('opens the exam once every LECTURE is cleared, quizzes or no quizzes', async () => {
    await clear(lessons[0]!);
    await clear(lessons[1]!);

    // The lecture quiz is deliberately left untouched. A quiz gets one sitting
    // and `failed` is not cleared, so counting quizzes here is what used to
    // shut the exam permanently for a student who had scored under the pass
    // mark once — see `gate-rule.ts`.
    await expect(player.lesson(userId, examId)).resolves.toMatchObject({
      lesson: { id: examId },
    });
  });
});
