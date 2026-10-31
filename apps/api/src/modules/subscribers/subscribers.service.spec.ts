// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { SubscribersService } from './subscribers.service';

/**
 * The SELECTION, against a real database — the counts and the lists are SQL,
 * and the ways they can be wrong are about which grants count:
 *
 *   · a wide (whole-course) grant must cover EVERY month, the way
 *     `monthSliceOf` opens them, or a full-course subscriber reads as
 *     «مشتركش في شهر ٢»;
 *   · a revoked grant is not «مشترك» — it is «كان مشترك»;
 *   · the foundation course is not a subscription this screen reports on, so
 *     a live grant on it leaves the student in «مش مشترك»;
 *   · an account with no profile still has a phone and belongs on the ads list.
 *
 * The dev database is a real cohort, so every list is narrowed with `q` on a
 * stamp only these rows carry, and every count is read off THIS course.
 */
describe('SubscribersService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new SubscribersService(prisma);

  const stamp = `sr${Date.now()}`;
  const ids: Record<string, string> = {};
  let courseId = '';
  let foundationId = '';
  let monthOne = '';
  let monthTwo = '';
  let phoneSeq = 0;

  async function account(key: string, profile: { year: number | null } | null): Promise<string> {
    const id = `${stamp}-${key}`;
    phoneSeq += 1;
    const phone = `+2011${stamp.slice(-6)}${String(phoneSeq).padStart(2, '0')}`;
    await prisma.user.create({
      data: { id, name: `مشترك ${stamp} ${key}`, email: `${id}@t.test`, phoneNumber: phone },
    });
    if (profile) {
      const governorate = await prisma.governorate.findFirstOrThrow();
      await prisma.studentProfile.create({
        data: {
          userId: id,
          fullName: `طالب ${stamp} ${key}`,
          gender: 'female',
          phone,
          governorateCode: governorate.code,
          year: profile.year,
        },
      });
    }
    ids[key] = id;
    return id;
  }

  async function grant(
    userId: string,
    data: { scope: 'course' | 'course_month'; courseId: string; monthId?: string; revokedAt?: Date },
  ): Promise<void> {
    await prisma.accessGrant.create({ data: { userId, source: 'purchase', ...data } });
  }

  beforeAll(async () => {
    await prisma.$connect();
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    const instructor = await account('instructor', null);
    await prisma.user.update({ where: { id: instructor }, data: { role: 'admin' } });

    const base = { status: 'draft' as const, systemId: system.id, subjectId: subject.id, year: 3, instructorId: instructor, requiresGrant: true };
    courseId = (await prisma.course.create({ data: { ...base, slug: `${stamp}-c`, title: `كورس ${stamp}` } })).id;
    foundationId = (
      await prisma.course.create({ data: { ...base, slug: `${stamp}-f`, title: `تأسيس ${stamp}` } })
    ).id;
    monthOne = (await prisma.courseMonth.create({ data: { courseId, monthIndex: 1, title: 'شهر ١' } })).id;
    monthTwo = (await prisma.courseMonth.create({ data: { courseId, monthIndex: 2, title: 'شهر ٢' } })).id;

    const both = await account('both', { year: 3 });
    const firstOnly = await account('first', { year: 3 });
    const wide = await account('wide', { year: 3 });
    const revoked = await account('revoked', { year: 3 });
    await account('never', { year: 3 });
    const otherYear = await account('other-year', { year: 1 });
    await account('no-profile', null);

    await grant(both, { scope: 'course_month', courseId, monthId: monthOne });
    await grant(both, { scope: 'course_month', courseId, monthId: monthTwo });
    await grant(firstOnly, { scope: 'course_month', courseId, monthId: monthOne });
    await grant(wide, { scope: 'course', courseId });
    await grant(revoked, { scope: 'course_month', courseId, monthId: monthOne, revokedAt: new Date() });
    // Live, and on the foundation course — must not make anyone «مشترك».
    await grant(otherYear, { scope: 'course', courseId: foundationId });
  });

  afterAll(async () => {
    const all = Object.values(ids);
    await prisma.accessGrant.deleteMany({ where: { userId: { in: all } } });
    await prisma.courseMonth.deleteMany({ where: { courseId } });
    await prisma.course.deleteMany({ where: { id: { in: [courseId, foundationId] } } });
    await prisma.studentProfile.deleteMany({ where: { userId: { in: all } } });
    await prisma.user.deleteMany({ where: { id: { in: all } } });
    await prisma.$disconnect();
  });

  const keysOf = (rows: { userId: string }[]) =>
    rows.map((row) => row.userId.slice(stamp.length + 1)).sort();

  const list = async (query: Partial<Parameters<SubscribersService['list']>[0]>) =>
    keysOf(
      (
        await service.list(
          { status: 'out', audience: 'all', withPhone: false, q: stamp, ...query },
          100,
          0,
        )
      ).rows,
    );

  it('counts the course and each month, a whole-course grant covering every month', async () => {
    const overview = await service.overview();
    const course = overview.courses.find((row) => row.courseId === courseId);

    expect(course).toBeDefined();
    expect(course!.subscribed).toBe(3);
    expect(course!.lapsed).toBe(1);
    expect(course!.months.map((m) => [m.monthIndex, m.subscribed, m.boughtMonth, m.droppedOut])).toEqual([
      [1, 3, 2, 1],
      [2, 2, 1, 2],
    ]);
  });

  it('never reports the foundation course', async () => {
    const overview = await service.overview();
    expect(overview.courses.some((row) => row.courseId === foundationId)).toBe(false);
  });

  it('lists who bought month 2 or holds the whole course', async () => {
    expect(await list({ status: 'in', courseId, monthId: monthTwo })).toEqual(['both', 'wide']);
  });

  it('lists who subscribed before and did not take month 2', async () => {
    expect(await list({ audience: 'past', courseId, monthId: monthTwo })).toEqual(['first', 'revoked']);
  });

  it('adds the year’s students who never subscribed, and nobody from another year', async () => {
    expect(await list({ courseId, monthId: monthTwo })).toEqual(['first', 'never', 'revoked']);
  });

  it('lists everyone on the platform without a live paid course — no profile included', async () => {
    expect(await list({})).toEqual(['never', 'no-profile', 'other-year', 'revoked']);
    expect(await list({ audience: 'past' })).toEqual(['revoked']);
  });

  it('says what each subscriber holds', async () => {
    const { rows } = await service.list(
      { status: 'in', audience: 'all', withPhone: false, q: stamp, courseId },
      100,
      0,
    );
    const byKey = Object.fromEntries(rows.map((row) => [row.userId.slice(stamp.length + 1), row.holdings]));
    expect(byKey.both).toEqual([{ courseId, title: `كورس ${stamp}`, wide: false, monthIndexes: [1, 2] }]);
    expect(byKey.wide).toEqual([{ courseId, title: `كورس ${stamp}`, wide: true, monthIndexes: [] }]);
  });

  it('refuses a month of another course and the foundation course itself', async () => {
    await expect(service.list({ status: 'out', audience: 'all', withPhone: false, q: '', courseId: foundationId }, 10, 0)).rejects.toThrow();
    await expect(
      service.list(
        { status: 'out', audience: 'all', withPhone: false, q: '', courseId: foundationId, monthId: monthTwo },
        10,
        0,
      ),
    ).rejects.toThrow();
  });
});
