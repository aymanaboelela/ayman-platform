import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { seedQuizFixture } from './quiz-fixtures';

describe('seedQuizFixture', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeding twice produces independent fixtures', async () => {
    const a = await seedQuizFixture(prisma, { questionCount: 2 });
    const b = await seedQuizFixture(prisma, { questionCount: 2 });

    expect(a.quizId).not.toBe(b.quizId);
    expect(a.studentId).not.toBe(b.studentId);
    expect(a.courseId).not.toBe(b.courseId);

    await a.cleanup();
    await b.cleanup();
  });

  it('cleanup() leaves zero rows behind', async () => {
    const fixture = await seedQuizFixture(prisma, { questionCount: 2, includeEssay: true });
    const { courseId, quizId, categoryId, bankEntryIds, studentId, otherStudentId, adminId } =
      fixture;

    await fixture.cleanup();

    expect(await prisma.course.findUnique({ where: { id: courseId } })).toBeNull();
    expect(await prisma.quiz.findUnique({ where: { id: quizId } })).toBeNull();
    expect(await prisma.questionCategory.findUnique({ where: { id: categoryId } })).toBeNull();
    expect(
      await prisma.questionBankEntry.count({ where: { id: { in: bankEntryIds } } }),
    ).toBe(0);
    expect(
      await prisma.user.count({ where: { id: { in: [studentId, otherStudentId, adminId] } } }),
    ).toBe(0);
  });

  it('produces one attempt_question-free quiz with the requested slot count', async () => {
    const fixture = await seedQuizFixture(prisma, { questionCount: 4 });
    const slots = await prisma.quizSlot.count({ where: { quizId: fixture.quizId } });
    expect(slots).toBe(4);
    expect(fixture.bankEntryIds).toHaveLength(4);
    await fixture.cleanup();
  });
});
