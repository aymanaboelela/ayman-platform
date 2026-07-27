import { ForbiddenException } from '@nestjs/common';
import { StudentsService } from './students.service';

const BASE_QUERY = {
  page: 1,
  perPage: 20,
  q: '',
  governorate: [] as string[],
  year: [] as number[],
  track: [] as string[],
  sort: 'createdAt',
  dir: 'desc' as const,
};

function makeService() {
  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };
  const prisma = {
    studentProfile: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null as unknown),
      update: jest.fn(async () => ({})),
    },
    user: {
      findUnique: jest.fn(async () => null as unknown),
      count: jest.fn(async () => 1),
      update: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { service: new StudentsService(prisma as never, audit as never), prisma, audit };
}

describe('StudentsService.list', () => {
  it('falls back to createdAt when an unknown sort key is passed', async () => {
    const { service, prisma } = makeService();
    await service.list({ ...BASE_QUERY, sort: 'password; DROP TABLE users --' });
    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { userId: 'asc' }] }),
    );
  });

  it('reports rowCount as the filtered total, not the page length', async () => {
    const { service, prisma } = makeService();
    prisma.studentProfile.count.mockResolvedValueOnce(137);
    prisma.studentProfile.findMany.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => ({
        userId: `u${i}`,
        fullName: 'طالب',
        phone: '+201000000000',
        gender: 'male',
        governorateCode: '01',
        year: 2,
        onboardingCompletedAt: new Date(),
        createdAt: new Date(),
        user: { email: 'a@b.com' },
        governorate: { nameAr: 'القاهرة' },
        system: { slug: 'general' },
        track: null,
      })),
    );

    const result = await service.list(BASE_QUERY);
    expect(result.rowCount).toBe(137);
    expect(result.rows).toHaveLength(20);
  });
});

describe('StudentsService.patch', () => {
  it('rejects assigning a track to a year-1 student without clearing the track first', async () => {
    const { service, prisma } = makeService();
    prisma.studentProfile.findUnique.mockResolvedValueOnce({
      userId: 'u1',
      year: 2,
      trackId: 'track-1',
    });

    await expect(service.patch('u1', { year: 1 })).rejects.toThrow(
      'year 1 cannot have a track',
    );
    expect(prisma.studentProfile.update).not.toHaveBeenCalled();
  });
});

describe('StudentsService.changeRole', () => {
  it('refuses self-demotion', async () => {
    const { service } = makeService();
    await expect(service.changeRole('u1', { role: 'student', reason: 'a real reason' }, 'u1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses demoting the last remaining admin', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ role: 'admin' });
    prisma.user.count.mockResolvedValueOnce(1);

    await expect(
      service.changeRole('target', { role: 'student', reason: 'a real reason' }, 'actor'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when at least one other admin remains, and writes one audit entry', async () => {
    const { service, prisma, audit } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ role: 'admin' });
    prisma.user.count.mockResolvedValueOnce(2);

    const result = await service.changeRole(
      'target',
      { role: 'student', reason: 'a real reason' },
      'actor',
    );
    expect(result).toEqual({ role: 'student' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'target' },
      data: { role: 'student' },
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'student:role-change',
      resourceType: 'user',
      resourceId: 'target',
      outcome: 'success',
    });
  });

  it('throws not found for a target user that does not exist', async () => {
    const { service } = makeService();
    await expect(
      service.changeRole('missing', { role: 'admin', reason: 'a real reason' }, 'actor'),
    ).rejects.toThrow();
  });
});
