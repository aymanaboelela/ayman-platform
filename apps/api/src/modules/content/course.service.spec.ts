// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseService } from './course.service';

// Integration test against the real database — the same reasoning as
// entitlement.service.spec.ts: a mock would only prove the mock matches
// itself, and the taxonomy re-validation is half the behaviour under test.
describe('CourseService', () => {
  let prisma: PrismaService;
  let service: CourseService;
  let adminId: string;
  let trackId: string;
  let subjectId: string;
  let systemId: string;
  let suffix: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new CourseService(prisma);

    suffix = Date.now().toString(36);
    const admin = await prisma.user.create({
      data: { id: `crs-${suffix}`, name: 'أيمن', email: `crs-${suffix}@example.com`, role: 'admin' },
    });
    adminId = admin.id;

    // A real offering, so the tuple validation has something legitimate to pass.
    const offering = await prisma.subjectOffering.findFirstOrThrow({
      where: { trackId: { not: null }, year: 2 },
      select: { systemId: true, trackId: true, subjectId: true },
    });
    systemId = offering.systemId;
    trackId = offering.trackId as string;
    subjectId = offering.subjectId;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: adminId } });
    await prisma.user.delete({ where: { id: adminId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const input = (overrides: Record<string, unknown> = {}) => ({
    slug: `course-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'البرمجة وعلوم الحاسب',
    subtitle: null,
    description: null,
    systemId,
    year: 2,
    trackId,
    subjectId,
    coverKey: null,
    ...overrides,
  });

  it('creates a draft and stamps the instructor from the session, not the body', async () => {
    const course = await service.create(adminId, input());
    expect(course.status).toBe('draft');
    expect(course.publishedAt).toBeNull();
    expect(course.instructorId).toBe(adminId);
    expect(course.position).toBe(0);
  });

  it('rejects a (system, year, track, subject) tuple with no matching offering', async () => {
    const otherSubject = await prisma.subject.findFirstOrThrow({ where: { id: { not: subjectId } } });
    await expect(
      service.create(adminId, input({ subjectId: otherSubject.id, year: 3 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a grade-1 course carrying a track, at the service layer too', async () => {
    await expect(service.create(adminId, input({ year: 1 }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('turns a duplicate slug into a 409, not a 500', async () => {
    const slug = `dup-${suffix}`;
    await service.create(adminId, input({ slug }));
    await expect(service.create(adminId, input({ slug }))).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to publish a course with no published lesson', async () => {
    const course = await service.create(adminId, input());
    await expect(service.setStatus(course.id, 'published')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('stamps publishedAt once and never moves it on republish', async () => {
    const course = await service.create(adminId, input());
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'قسم', position: 0, isPublished: true },
    });
    await prisma.lesson.create({
      data: {
        courseId: course.id,
        sectionId: section.id,
        title: 'محاضرة',
        kind: 'text',
        position: 0,
        isPublished: true,
      },
    });

    const published = await service.setStatus(course.id, 'published');
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeInstanceOf(Date);

    await service.setStatus(course.id, 'draft');
    const republished = await service.setStatus(course.id, 'published');
    expect(republished.publishedAt?.getTime()).toBe(published.publishedAt?.getTime());
  });

  it('never lets update() change status, even if the object somehow carries one', async () => {
    const course = await service.create(adminId, input());
    // Simulates a caller that bypassed the DTO — the service must not spread.
    await service.update(course.id, { title: 'اسم جديد', status: 'published' } as never);
    const after = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(after.title).toBe('اسم جديد');
    expect(after.status).toBe('draft');
  });

  it('404s on an unknown id rather than returning null', async () => {
    await expect(service.findForAdmin(crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundException);
  });
});
