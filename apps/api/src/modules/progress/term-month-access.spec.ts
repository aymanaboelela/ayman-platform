// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { LessonAccessService } from './lesson-access.service';
import { LessonGateService } from './lesson-gate.service';

/**
 * A course sold BOTH by term and by curriculum month — the editor's default
 * shape (two terms, ten months).
 *
 * The hole this pins shut: a student holding «الترم الأول» who then bought one
 * cheap month (or redeemed a month code) could open every lecture of «الترم
 * الثاني». The month grant was the newest, so `resolveCourseAccess` returned
 * it and the exact-term check never ran; the month check then unioned every
 * live grant and read the term-one grant as «everything». Real database, real
 * grants: the boundary is what three services agree on, and a mock of any of
 * them would only prove the mock.
 */
describe('LessonAccessService — a term grant beside a month grant', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const entitlement = new EntitlementService(prisma);
  const service = new LessonAccessService(
    prisma,
    new LessonGateService(prisma, new EntitlementService(prisma)),
    entitlement,
  );

  const stamp = `${Date.now().toString(36)}-tm`;
  let instructorId = '';
  let studentId = '';
  let courseId = '';
  let termOneId = '';
  let monthOneId = '';
  let monthTwoId = '';
  /** «الترم الأول», tagged with month one. */
  let termOneLesson = '';
  /** «الترم الثاني», tagged with month two — never bought. */
  let termTwoMonthTwoLesson = '';
  /** «الترم الثاني», carrying no month at all. */
  let termTwoUntagged = '';
  /** «الترم الثاني», tagged with month one — bought. */
  let termTwoMonthOneLesson = '';

  beforeAll(async () => {
    await prisma.$connect();
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    instructorId = (
      await prisma.user.create({ data: { id: `tm-instr-${stamp}`, name: 'مدرس', email: `tm-instr-${stamp}@t.test` } })
    ).id;
    studentId = (
      await prisma.user.create({ data: { id: `tm-stu-${stamp}`, name: 'طالب', email: `tm-stu-${stamp}@t.test` } })
    ).id;

    courseId = (
      await prisma.course.create({
        data: {
          slug: `tm-course-${stamp}`,
          title: 'كورس بترمين وشهور',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          year: 2,
          subjectId: subject.id,
          instructorId,
          requiresGrant: true,
          monthlyPriceCents: 15_000,
        },
      })
    ).id;

    termOneId = (await prisma.courseTerm.create({ data: { courseId, title: 'الترم الأول', position: 0 } })).id;
    const termTwoId = (await prisma.courseTerm.create({ data: { courseId, title: 'الترم الثاني', position: 1 } })).id;
    monthOneId = (await prisma.courseMonth.create({ data: { courseId, monthIndex: 1, title: 'شهر ١' } })).id;
    monthTwoId = (await prisma.courseMonth.create({ data: { courseId, monthIndex: 2, title: 'شهر ٢' } })).id;

    const sectionOne = await prisma.courseSection.create({
      data: { courseId, title: 'وحدة الترم الأول', position: 1, isPublished: true, termId: termOneId },
    });
    const sectionTwo = await prisma.courseSection.create({
      data: { courseId, title: 'وحدة الترم الثاني', position: 2, isPublished: true, termId: termTwoId },
    });

    const lesson = async (sectionId: string, position: number, monthId: string | null) => {
      const row = await prisma.lesson.create({
        data: {
          courseId,
          sectionId,
          title: `درس ${position}`,
          kind: 'text',
          position,
          isPublished: true,
          text: { create: { bodyHtml: '<p>محتوى</p>' } },
        },
      });
      if (monthId) await prisma.lessonMonth.create({ data: { lessonId: row.id, monthId, courseId } });
      return row.id;
    };
    termOneLesson = await lesson(sectionOne.id, 1, monthOneId);
    termTwoMonthTwoLesson = await lesson(sectionTwo.id, 1, monthTwoId);
    termTwoUntagged = await lesson(sectionTwo.id, 2, null);
    termTwoMonthOneLesson = await lesson(sectionTwo.id, 3, monthOneId);

    await prisma.enrollment.create({
      data: { userId: studentId, courseId, source: 'purchase', status: 'active' },
    });
  });

  afterEach(async () => {
    await prisma.accessGrant.deleteMany({ where: { userId: studentId } });
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, instructorId] } } });
    await prisma.$disconnect();
  });

  /** «الترم الأول» bought two days ago, then month one bought today — the newer grant. */
  async function termOneThenMonthOne(): Promise<void> {
    await prisma.accessGrant.create({
      data: {
        userId: studentId,
        scope: 'term',
        courseId,
        termId: termOneId,
        source: 'purchase',
        validFrom: new Date(Date.now() - 2 * 86_400_000),
      },
    });
    await prisma.accessGrant.create({
      data: { userId: studentId, scope: 'course_month', courseId, monthId: monthOneId, source: 'purchase' },
    });
  }

  it('does not open a lecture of the OTHER term in a month that was never bought', async () => {
    await termOneThenMonthOne();

    await expect(service.requireEntitled(studentId, termTwoMonthTwoLesson)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not open an untagged lecture of the OTHER term either', async () => {
    await termOneThenMonthOne();

    await expect(service.requireEntitled(studentId, termTwoUntagged)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still opens everything the two grants really pay for', async () => {
    await termOneThenMonthOne();

    // The term they bought…
    await expect(service.requireEntitled(studentId, termOneLesson)).resolves.toMatchObject({
      lessonId: termOneLesson,
    });
    // …and the month they bought, wherever its lectures sit.
    await expect(service.requireEntitled(studentId, termTwoMonthOneLesson)).resolves.toMatchObject({
      lessonId: termTwoMonthOneLesson,
    });
  });

  it('a term grant alone still opens its own term and nothing of the other', async () => {
    await prisma.accessGrant.create({
      data: { userId: studentId, scope: 'term', courseId, termId: termOneId, source: 'purchase' },
    });

    await expect(service.requireEntitled(studentId, termOneLesson)).resolves.toMatchObject({
      lessonId: termOneLesson,
    });
    await expect(service.requireEntitled(studentId, termTwoMonthTwoLesson)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a course-wide grant beside a month grant still opens every term', async () => {
    await prisma.accessGrant.create({
      data: {
        userId: studentId,
        scope: 'course',
        courseId,
        source: 'purchase',
        validFrom: new Date(Date.now() - 2 * 86_400_000),
      },
    });
    await prisma.accessGrant.create({
      data: { userId: studentId, scope: 'course_month', courseId, monthId: monthTwoId, source: 'purchase' },
    });

    await expect(service.requireEntitled(studentId, termTwoUntagged)).resolves.toMatchObject({
      lessonId: termTwoUntagged,
    });
    await expect(service.requireEntitled(studentId, termOneLesson)).resolves.toMatchObject({
      lessonId: termOneLesson,
    });
  });
});
