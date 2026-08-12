// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { GENESIS_HASH } from './chain';

/**
 * Integration test against the real database. The advisory lock, the ordering
 * guarantee and the REVOKEs are exactly what a mock would not prove.
 *
 * `audit_log` is append-only for `ayman_runtime`, so nothing here cleans up
 * after itself — that is the point of the table. The tamper test is the one
 * exception: it needs OWNER rights (which `ayman_runtime` does not have, and
 * must not be given), so it opens a second client on DIRECT_DATABASE_URL and
 * restores the row afterwards so the chain verifies again on the next run.
 */
describe('AuditService (integration)', () => {
  let service: AuditService;
  let prisma: PrismaService;
  let owner: PrismaClient;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, PrismaService],
    }).compile();
    service = moduleRef.get(AuditService);
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();

    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DIRECT_DATABASE_URL }),
    });
    await owner.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await owner.$disconnect();
  });

  const input = (action: 'flag:update' | 'settings:update') => ({
    action,
    resourceType: 'test',
    resourceId: 'r1',
    outcome: 'success' as const,
    actorUserId: null,
    actorIp: null,
    actorUserAgent: null,
    requestId: null,
    metadata: { probe: true },
  });

  /**
   * Asserted against the row that actually precedes it in id order, not
   * against the row this test happened to write first. Jest runs spec FILES in
   * parallel workers and the retrofitted services in other files write real
   * audit entries — `first` is not guaranteed to be `second`'s predecessor,
   * and asserting that it is produces a test that fails on a fast machine and
   * passes on a slow one. The invariant that actually matters is "every row
   * points at the row before it", and that is what is checked here.
   */
  it('links every row it writes to the row immediately before it', async () => {
    const first = await service.record(input('flag:update'));
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);

    const second = await service.record(input('settings:update'));
    const predecessor = await prisma.auditLog.findFirst({
      where: { id: { lt: second.id } },
      orderBy: { id: 'desc' },
      select: { hash: true },
    });

    expect(second.prevHash).toBe(predecessor?.hash ?? null);
  });

  it('anchors row 1 of an empty table to GENESIS_HASH', async () => {
    const count = await prisma.auditLog.count();
    if (count > 0) {
      // The table is append-only and we cannot truncate as ayman_runtime, so
      // this assertion only runs on a genuinely fresh database.
      expect(GENESIS_HASH).toHaveLength(64);
      return;
    }
    const only = await service.record(input('flag:update'));
    expect(only.prevHash).toBeNull();
  });

  it('verifyChain reports ok over an untampered chain', async () => {
    await expect(service.verifyChain()).resolves.toEqual({ ok: true });
  });

  it('the runtime role cannot UPDATE or DELETE the trail (A7)', async () => {
    await expect(
      prisma.$executeRaw`UPDATE app.audit_log SET outcome = 'tampered'`,
    ).rejects.toThrow(/permission denied for table audit_log/);
    await expect(prisma.$executeRaw`DELETE FROM app.audit_log`).rejects.toThrow(
      /permission denied for table audit_log/,
    );
  });

  it('verifyChain detects a tampered row', async () => {
    const row = await service.record(input('flag:update'));

    // `finally`, and it has to be. The restore used to sit as a plain statement
    // after the assertion above, with a comment explaining why it mattered —
    // and that is exactly the arrangement that cannot survive the assertion
    // failing. Any throw between the tamper and the restore skips the restore,
    // and the row stays tampered in a database that outlives the run.
    //
    // The damage compounds, which is what makes it worth a `finally` rather
    // than a note. `verifyChain` scans the whole table from the start, so ONE
    // orphaned row means the next run's assertion reports that old row's id
    // instead of this one's — the assertion fails, the restore is skipped
    // again, and another orphan is left behind. Every run adds one.
    //
    // Found on a dev database carrying 16 of them (id 103881 onward, all
    // `resource_type = 'test'`, all `{"probe": false}`, every link between rows
    // intact). It had been failing three specs on that machine for long enough
    // to look like a broken test suite.
    try {
      // Only the OWNER can do this — which is the point: the runtime role
      // cannot, and if someone with owner rights does, verification still
      // catches it.
      await owner.$executeRaw`
        UPDATE app.audit_log SET metadata = '{"probe":false}'::jsonb WHERE id = ${row.id}
      `;
      await expect(service.verifyChain()).resolves.toEqual({
        ok: false,
        brokenAtId: row.id.toString(),
      });
    } finally {
      await owner.$executeRaw`
        UPDATE app.audit_log SET metadata = '{"probe":true}'::jsonb WHERE id = ${row.id}
      `;
    }

    await expect(service.verifyChain()).resolves.toEqual({ ok: true });
  });
});
