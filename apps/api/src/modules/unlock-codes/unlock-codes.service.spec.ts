// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { UnlockAttemptsService } from './unlock-attempts.service';
import { UnlockCodesService } from './unlock-codes.service';

/**
 * «أكواد الفتح», end to end against the real database: a code is generated,
 * redeemed, and then the SAME gate the player, the quiz and the homework go
 * through is asked what it opens. Every test states the promise it proves —
 * «محاضرة واحدة بتفتح محاضرة واحدة», «الكود مايشتغلش لطالب تاني» — not the
 * code path.
 */

/** Redis stand-in: nothing is ever locked. The ladder has its own tests;
 *  these are about what a code opens. */
const noRedis = {
  pttl: async () => -2,
  incr: async () => 1,
  expire: async () => 1,
  set: async () => 'OK',
  del: async () => 1,
} as unknown as Redis;

describe('UnlockCodesService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const entitlement = new EntitlementService(prisma);
  const gate = new LessonGateService(prisma, entitlement);
  const access = new LessonAccessService(prisma, gate, entitlement);
  const codes = new UnlockCodesService(prisma, new AuditService(prisma), new UnlockAttemptsService(noRedis));

  let instructorId = '';
  let adminId = '';
  let systemId = '';
  let subjectId = '';

  beforeAll(async () => {
    await prisma.$connect();
    systemId = (await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } })).id;
    subjectId = (await prisma.subject.findFirstOrThrow()).id;
    const stamp = Date.now();
    instructorId = (
      await prisma.user.create({ data: { id: `uc-instr-${stamp}`, name: 'مدرس', email: `uc-instr-${stamp}@t.test` } })
    ).id;
    adminId = (
      await prisma.user.create({
        data: { id: `uc-admin-${stamp}`, name: 'أدمن', email: `uc-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId } });
    await prisma.user.deleteMany({ where: { id: { startsWith: 'uc-' } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function student(): Promise<string> {
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return (await prisma.user.create({ data: { id: `uc-stu-${stamp}`, name: 'طالب', email: `uc-stu-${stamp}@t.test` } })).id;
  }

  /** A closed course: two units, two lectures each. */
  async function course() {
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const row = await prisma.course.create({
      data: {
        slug: `uc-course-${stamp}`,
        title: 'كورس الأكواد',
        status: 'published',
        publishedAt: new Date(),
        systemId,
        year: 2,
        subjectId,
        instructorId,
        requiresGrant: true,
      },
    });
    const lessons: string[] = [];
    const sections: string[] = [];
    for (const position of [1, 2]) {
      const section = await prisma.courseSection.create({
        data: { courseId: row.id, title: `الوحدة ${position}`, position, isPublished: true },
      });
      sections.push(section.id);
      for (const lessonPosition of [1, 2]) {
        const lesson = await prisma.lesson.create({
          data: {
            courseId: row.id,
            sectionId: section.id,
            title: `المحاضرة ${position}.${lessonPosition}`,
            kind: 'text',
            position: lessonPosition,
            isPublished: true,
            text: { create: { bodyHtml: '<p>محتوى</p>' } },
          },
        });
        lessons.push(lesson.id);
      }
    }
    return { courseId: row.id, sections, lessons };
  }

  async function makeCode(courseId: string, items: { kind: 'term' | 'month' | 'section' | 'lesson'; id: string }[]) {
    const { codes: [row] } = await codes.create(adminId, {
      courseId,
      wholeCourse: false,
      items,
      quantity: 1,
      priceCents: 5_000,
      note: null,
    });
    return row!;
  }

  it('a lecture code opens that lecture — and nothing else in the course', async () => {
    const { courseId, lessons } = await course();
    const userId = await student();
    const code = await makeCode(courseId, [{ kind: 'lesson', id: lessons[2]! }]);

    const result = await codes.redeem(userId, '10.0.0.1', code.code);
    expect(result.startLessonId).toBe(lessons[2]);
    expect(result.opened).toEqual([
      expect.objectContaining({ kind: 'lesson', lessonCount: 1, lessonId: lessons[2] }),
    ]);

    await expect(access.require(userId, lessons[2]!)).resolves.toMatchObject({ lessonId: lessons[2] });
    // The enrollment the code had to create is NOT a key to the course.
    await expect(access.requireEntitled(userId, lessons[0]!)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(access.requireEntitled(userId, lessons[3]!)).rejects.toBeInstanceOf(ForbiddenException);

    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { userId_courseId: { userId, courseId } },
    });
    const outline = await gate.resolveCourse(enrollment.id, courseId, userId);
    expect(lessons.map((id) => outline.get(id))).toEqual(['locked', 'locked', 'available', 'locked']);
  });

  it('works once: a second student gets «used», and the first keeps it', async () => {
    const { courseId, lessons } = await course();
    const first = await student();
    const second = await student();
    const code = await makeCode(courseId, [{ kind: 'lesson', id: lessons[0]! }]);

    await codes.redeem(first, '10.0.0.2', code.code);
    await expect(codes.redeem(second, '10.0.0.3', code.code)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'unlock_used' }),
    });
    // The same student pressing twice is shown their success again, not refused.
    await expect(codes.redeem(first, '10.0.0.2', code.code)).resolves.toMatchObject({ code: code.code });

    await expect(access.require(first, lessons[0]!)).resolves.toBeDefined();
    await expect(access.require(second, lessons[0]!)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('two students racing one code: exactly one wins', async () => {
    const { courseId, lessons } = await course();
    const [a, b] = [await student(), await student()];
    const code = await makeCode(courseId, [{ kind: 'lesson', id: lessons[1]! }]);

    const outcomes = await Promise.allSettled([
      codes.redeem(a, '10.0.0.4', code.code),
      codes.redeem(b, '10.0.0.5', code.code),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.accessGrant.count({ where: { unlockCodeId: code.id } })).toBe(1);
  });

  it('a unit code opens every lecture in the unit, including one added later', async () => {
    const { courseId, sections, lessons } = await course();
    const userId = await student();
    const code = await makeCode(courseId, [{ kind: 'section', id: sections[1]! }]);
    const result = await codes.redeem(userId, '10.0.0.6', code.code);
    expect(result.opened[0]).toMatchObject({ kind: 'section', lessonCount: 2 });

    await expect(access.require(userId, lessons[2]!)).resolves.toBeDefined();
    await expect(access.require(userId, lessons[3]!)).resolves.toBeDefined();
    await expect(access.requireEntitled(userId, lessons[0]!)).rejects.toBeInstanceOf(ForbiddenException);

    const later = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: sections[1]!,
        title: 'محاضرة جديدة',
        kind: 'text',
        position: 3,
        isPublished: true,
        text: { create: { bodyHtml: '<p>جديد</p>' } },
      },
    });
    await expect(access.require(userId, later.id)).resolves.toBeDefined();
  });

  it('a month subscriber buys one lecture from another month — the month stays, the lecture opens', async () => {
    const { courseId, lessons } = await course();
    const [m1, m2] = await Promise.all(
      [1, 2].map((monthIndex) =>
        prisma.courseMonth.create({ data: { courseId, monthIndex, title: `شهر ${monthIndex}` } }),
      ),
    );
    await prisma.lessonMonth.createMany({
      data: [
        { lessonId: lessons[0]!, monthId: m1!.id, courseId, isPrimary: true },
        { lessonId: lessons[1]!, monthId: m1!.id, courseId, isPrimary: true },
        { lessonId: lessons[2]!, monthId: m2!.id, courseId, isPrimary: true },
        { lessonId: lessons[3]!, monthId: m2!.id, courseId, isPrimary: true },
      ],
    });
    const userId = await student();
    await prisma.accessGrant.create({
      data: { userId, scope: 'course_month', courseId, monthId: m1!.id, source: 'purchase' },
    });
    await prisma.enrollment.create({ data: { userId, courseId, source: 'purchase' } });

    await expect(access.requireEntitled(userId, lessons[2]!)).rejects.toMatchObject({ message: 'needs_month_grant' });

    const code = await makeCode(courseId, [{ kind: 'lesson', id: lessons[2]! }]);
    await codes.redeem(userId, '10.0.0.7', code.code);

    await expect(access.require(userId, lessons[0]!)).resolves.toBeDefined();
    await expect(access.require(userId, lessons[2]!)).resolves.toBeDefined();
    await expect(access.requireEntitled(userId, lessons[3]!)).rejects.toMatchObject({ message: 'needs_month_grant' });
    // The purchase enrollment was not rewritten into a code one.
    expect(
      (await prisma.enrollment.findUniqueOrThrow({ where: { userId_courseId: { userId, courseId } } })).source,
    ).toBe('purchase');
  });

  it('pulling a used code closes what it opened and takes a code-only course off the library', async () => {
    const { courseId, lessons } = await course();
    const userId = await student();
    const code = await makeCode(courseId, [{ kind: 'lesson', id: lessons[0]! }]);
    await codes.redeem(userId, '10.0.0.8', code.code);
    await expect(access.require(userId, lessons[0]!)).resolves.toBeDefined();

    const row = await codes.revoke(adminId, code.id);
    expect(row.status).toBe('revoked');
    await expect(access.require(userId, lessons[0]!)).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (await prisma.enrollment.findUniqueOrThrow({ where: { userId_courseId: { userId, courseId } } })).status,
    ).toBe('revoked');
  });

  it('pulling a code leaves a subscription the student ALSO holds alone', async () => {
    const { courseId, lessons } = await course();
    const userId = await student();
    await prisma.accessGrant.create({ data: { userId, scope: 'course', courseId, source: 'purchase' } });
    await prisma.enrollment.create({ data: { userId, courseId, source: 'purchase' } });
    const code = await makeCode(courseId, [{ kind: 'lesson', id: lessons[0]! }]);
    await codes.redeem(userId, '10.0.0.9', code.code);

    await codes.revoke(adminId, code.id);
    await expect(access.require(userId, lessons[0]!)).resolves.toBeDefined();
    await expect(access.require(userId, lessons[3]!)).resolves.toBeDefined();
  });

  it('a whole-course code is a course grant: everything opens', async () => {
    const { courseId, lessons } = await course();
    const userId = await student();
    const { codes: [code] } = await codes.create(adminId, {
      courseId,
      wholeCourse: true,
      items: [],
      quantity: 1,
      priceCents: null,
      note: null,
    });
    const result = await codes.redeem(userId, '10.0.0.10', code!.code);
    expect(result.opened).toEqual([expect.objectContaining({ kind: 'course', lessonCount: 4 })]);
    for (const lessonId of lessons) await expect(access.require(userId, lessonId)).resolves.toBeDefined();
  });

  it('an unused code can be cancelled, and a cancelled one is refused', async () => {
    const { courseId, lessons } = await course();
    const userId = await student();
    const code = await makeCode(courseId, [{ kind: 'lesson', id: lessons[0]! }]);
    await codes.revoke(adminId, code.id);
    await expect(codes.redeem(userId, '10.0.0.11', code.code)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'unlock_revoked' }),
    });
  });

  it('refuses an item from another course', async () => {
    const a = await course();
    const b = await course();
    await expect(makeCode(a.courseId, [{ kind: 'lesson', id: b.lessons[0]! }])).rejects.toBeInstanceOf(HttpException);
  });

  it('does not spend a code for a course that is not published', async () => {
    const { courseId, lessons } = await course();
    const userId = await student();
    const code = await makeCode(courseId, [{ kind: 'lesson', id: lessons[0]! }]);
    await prisma.course.update({ where: { id: courseId }, data: { status: 'draft' } });
    await expect(codes.redeem(userId, '10.0.0.12', code.code)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'unlock_course_unavailable' }),
    });
    expect((await prisma.unlockCode.findUniqueOrThrow({ where: { id: code.id } })).redeemedAt).toBeNull();
  });

  it('lists what the student opened, and the admin list says who used it', async () => {
    const { courseId, lessons } = await course();
    const userId = await student();
    const code = await makeCode(courseId, [{ kind: 'lesson', id: lessons[1]! }]);
    await codes.redeem(userId, '10.0.0.13', code.code);

    const mine = await codes.listMine(userId);
    expect(mine.items).toEqual([expect.objectContaining({ code: code.code, revoked: false })]);

    const list = await codes.list({ page: 1, perPage: 20, q: code.code, status: 'used', courseId });
    expect(list.rows).toEqual([
      expect.objectContaining({ code: code.code, status: 'used', redeemedBy: expect.objectContaining({ id: userId }) }),
    ]);
  });
});
