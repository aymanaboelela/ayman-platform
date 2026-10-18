import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { PracticeGateService, PracticeOpenGuard } from './practice-gate.service';

/** A Prisma stand-in that answers only the one query the gate makes. */
function gateWith(row: { enabled: boolean } | null) {
  const prisma = { featureFlag: { findUnique: async () => row } } as unknown as PrismaService;
  return new PracticeGateService(prisma);
}

describe('PracticeOpenGuard', () => {
  it('404s every practice route while the flag row says off', async () => {
    const guard = new PracticeOpenGuard(gateWith({ enabled: false }));
    await expect(guard.canActivate()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the request through while the flag row says on', async () => {
    await expect(new PracticeOpenGuard(gateWith({ enabled: true })).canActivate()).resolves.toBe(true);
  });

  /* No row = the declared default. This suite runs without `TENANT_KEY`, i.e.
     as Ayman's stack, where `practice.enabled` starts on; the tenant default
     (off) is `flagStartsEnabled`'s own spec. */
  it('falls back to the declared default when no row exists', async () => {
    await expect(gateWith(null).isOpen()).resolves.toBe(true);
  });
});
