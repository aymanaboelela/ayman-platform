import { NotFoundException } from '@nestjs/common';
import { FlagsService } from './flags.service';

function makeService() {
  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };
  const prisma = {
    featureFlag: {
      upsert: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ where, data }: { where: { key: string }; data: { enabled: boolean } }) => ({
        key: where.key,
        descriptionAr: 'وصف',
        enabled: data.enabled,
        updatedAt: new Date(),
      })),
    },
  };
  return { service: new FlagsService(prisma as never, audit as never), prisma, audit };
}

describe('FlagsService.onModuleInit', () => {
  it('upserts every declaration, keeping enabled on CREATE only', async () => {
    const { service, prisma } = makeService();
    await service.onModuleInit();
    expect(prisma.featureFlag.upsert).toHaveBeenCalledTimes(7);
    const firstCall = prisma.featureFlag.upsert.mock.calls[0][0];
    expect(firstCall.update).not.toHaveProperty('enabled');
  });
});

describe('FlagsService.setEnabled', () => {
  it('rejects an undeclared key without touching the database', async () => {
    const { service, prisma } = makeService();
    await expect(service.setEnabled('not.a.real.flag', true)).rejects.toThrow(NotFoundException);
    expect(prisma.featureFlag.update).not.toHaveBeenCalled();
  });

  it('updates a declared flag and writes exactly one audit entry', async () => {
    const { service, audit } = makeService();
    const result = await service.setEnabled('quiz.practiceMode', false);
    expect(result.enabled).toBe(false);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'flag:update',
      resourceId: 'quiz.practiceMode',
      metadata: { enabled: false },
    });
  });
});
