// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { TermService } from './term.service';

/**
 * الترم الأول / الترم الثاني — CRUD, and the one action that is more than a
 * field edit: closing a term. Integration test against the real database,
 * same convention as `section.service.spec.ts` — the behaviour under test is
 * what the bulk `updateMany` actually revokes, and a mock cannot prove that.
 */
describe('TermService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const service = new TermService(prisma, audit);

  let instructorId = '';
  let courseId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `term-${suffix}`, name: 'أيمن', email: `term-${suffix}@example.com`, role: 'admin' },
    });
    instructorId = user.id;
    const offering = await prisma.subjectOffering.findFirstOrThrow({ where: { year: 2 } });
    const course = await prisma.course.create({
      data: {
        slug: `term-course-${suffix}`,
        title: 'كورس',
        systemId: offering.systemId,
        year: 2,
        trackId: offering.trackId,
        subjectId: offering.subjectId,
        instructorId,
      },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId } });
    await prisma.user.delete({ where: { id: instructorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('creates terms in order, appending positions from 0', async () => {
    const first = await service.create(courseId, { title: 'الترم الأول', priceCents: 45000 });
    const second = await service.create(courseId, { title: 'الترم الثاني', priceCents: 45000 });

    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
    expect(first.isOpen).toBe(true);
    expect(second.isOpen).toBe(true);
  });

  it('404s creating a term on an unknown course', async () => {
    await expect(
      service.create('00000000-0000-7000-8000-000000000000', { title: 'x', priceCents: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update() edits title/price and never touches isOpen', async () => {
    const term = await service.create(courseId, { title: 'مسودة', priceCents: null });
    const updated = await service.update(term.id, { title: 'الاسم النهائي', priceCents: 50000 });

    expect(updated.title).toBe('الاسم النهائي');
    expect(updated.priceCents).toBe(50000);
    expect(updated.isOpen).toBe(true);
  });

  describe('setOpen — the bulk-revoke-on-close action', () => {
    async function makeTermWithGrants(count: number) {
      const term = await service.create(courseId, { title: `ترم للاختبار ${Date.now()}`, priceCents: 45000 });
      const grantIds: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const suffix = `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`;
        const student = await prisma.user.create({
          data: { id: `term-stu-${suffix}`, name: 'طالب', email: `term-stu-${suffix}@t.test` },
        });
        const grant = await prisma.accessGrant.create({
          data: { userId: student.id, scope: 'term', courseId, termId: term.id, source: 'purchase' },
        });
        grantIds.push(grant.id);
      }
      return { term, grantIds };
    }

    it('closing bulk-revokes every LIVE term grant, in one call, and reports the real count', async () => {
      const { term, grantIds } = await makeTermWithGrants(3);

      const result = await service.setOpen(term.id, false);

      expect(result.term.isOpen).toBe(false);
      expect(result.revokedGrantCount).toBe(3);

      const grants = await prisma.accessGrant.findMany({ where: { id: { in: grantIds } } });
      expect(grants).toHaveLength(3);
      for (const grant of grants) {
        expect(grant.revokedAt).not.toBeNull();
      }
    });

    it('does not touch an already-revoked grant a second time, and reports 0 on a no-op close', async () => {
      const { term, grantIds } = await makeTermWithGrants(1);
      const firstClose = await service.setOpen(term.id, false);
      expect(firstClose.revokedGrantCount).toBe(1);

      const revokedAtAfterFirst = (
        await prisma.accessGrant.findUniqueOrThrow({ where: { id: grantIds[0] } })
      ).revokedAt;

      // Already closed — no live grants left to revoke.
      const secondClose = await service.setOpen(term.id, false);
      expect(secondClose.revokedGrantCount).toBe(0);

      const revokedAtAfterSecond = (
        await prisma.accessGrant.findUniqueOrThrow({ where: { id: grantIds[0] } })
      ).revokedAt;
      expect(revokedAtAfterSecond?.getTime()).toBe(revokedAtAfterFirst?.getTime());
    });

    it('reopening touches no grants at all — a revoked one stays revoked', async () => {
      const { term, grantIds } = await makeTermWithGrants(2);
      await service.setOpen(term.id, false);

      const result = await service.setOpen(term.id, true);
      expect(result.term.isOpen).toBe(true);
      expect(result.revokedGrantCount).toBe(0);

      const grants = await prisma.accessGrant.findMany({ where: { id: { in: grantIds } } });
      for (const grant of grants) {
        expect(grant.revokedAt).not.toBeNull();
      }
    });

    it('writes ONE audit row for the close, naming how many grants it cut off', async () => {
      const { term } = await makeTermWithGrants(2);
      await service.setOpen(term.id, false);

      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'term:close', resourceId: term.id },
        orderBy: { id: 'desc' },
      });
      expect((entry.metadata as Record<string, unknown>).revokedGrantCount).toBe(2);
    });

    it('never revokes a grant belonging to a DIFFERENT term', async () => {
      const { term: termA, grantIds: grantsA } = await makeTermWithGrants(1);
      const { grantIds: grantsB } = await makeTermWithGrants(1);

      await service.setOpen(termA.id, false);

      const untouchedGrant = await prisma.accessGrant.findUniqueOrThrow({ where: { id: grantsB[0] } });
      expect(untouchedGrant.revokedAt).toBeNull();

      const revokedGrant = await prisma.accessGrant.findUniqueOrThrow({ where: { id: grantsA[0] } });
      expect(revokedGrant.revokedAt).not.toBeNull();
    });
  });
});
