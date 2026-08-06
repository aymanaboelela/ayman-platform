// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuditService } from '../../audit/audit.service';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SectionService } from './section.service';

// Integration test against the real database, for the same reason
// lesson.service.spec.ts is one: the behaviour under test is what the CASCADE
// does, and a mock cannot cascade.
describe('SectionService', () => {
  let prisma: PrismaService;
  let service: SectionService;
  let courseId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new SectionService(prisma, new AuditService(prisma));

    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `sec-${suffix}`, name: 'أيمن', email: `sec-${suffix}@example.com`, role: 'admin' },
    });
    userId = user.id;
    const offering = await prisma.subjectOffering.findFirstOrThrow({ where: { year: 2 } });
    const course = await prisma.course.create({
      data: {
        slug: `sec-${suffix}`,
        title: 'كورس',
        systemId: offering.systemId,
        year: 2,
        trackId: offering.trackId,
        subjectId: offering.subjectId,
        instructorId: user.id,
      },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('refuses to delete a section holding a lesson with student attempts', async () => {
    const section = await service.create(courseId, {
      title: 'قسم فيه امتحان',
      summary: null,
      isPublished: false,
    });
    const lesson = await prisma.lesson.create({
      data: { courseId, sectionId: section.id, title: 'امتحان', kind: 'quiz', position: 0 },
    });
    const quiz = await prisma.quiz.create({ data: { lessonId: lesson.id, reviewOptions: {} } });
    // Bare attempt, no AttemptEvent children — see the note in
    // lesson.service.spec.ts for why events would make this spec uncleanable.
    await prisma.quizAttempt.create({
      data: { quizId: quiz.id, userId, attemptNo: 1, sumMarks: 10, gradeOutOf: 100, passPercent: 70 },
    });

    await expect(service.remove(section.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.courseSection.findUnique({ where: { id: section.id }, select: { id: true } }),
    ).resolves.not.toBeNull();
  });

  it('deletes a section with no attempts and closes the position gap', async () => {
    const first = await service.create(courseId, { title: 'أ', summary: null, isPublished: false });
    const second = await service.create(courseId, { title: 'ب', summary: null, isPublished: false });
    const firstPosition = (
      await prisma.courseSection.findUniqueOrThrow({
        where: { id: first.id },
        select: { position: true },
      })
    ).position;

    await service.remove(first.id);

    const remaining = await prisma.courseSection.findUniqueOrThrow({
      where: { id: second.id },
      select: { position: true },
    });
    expect(remaining.position).toBe(firstPosition);
  });

  it('404s on a section that does not exist', async () => {
    await expect(service.remove('00000000-0000-7000-8000-000000000000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
