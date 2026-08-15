import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
      delete: jest.fn(async () => ({})),
    },
    // حظر deletes these two alongside stamping the flag; the tests below assert
    // that, because the flag on its own locks nobody out.
    session: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    sessionDevice: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    // The four `ON DELETE RESTRICT` relations `remove()` counts before it tries.
    course: { count: jest.fn(async () => 0) },
    questionBankEntry: { count: jest.fn(async () => 0) },
    questionVersion: { count: jest.fn(async () => 0) },
    newsPost: { count: jest.fn(async () => 0) },
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

/**
 * حظر.
 *
 * `detail()` is called at the end of `ban`/`unban` to return the fresh record,
 * and it reads `studentProfile.findUnique`. The mock returns `null` for that by
 * default, which makes `detail` throw `NotFoundException` — so every test below
 * that reaches the end asserts on the SIDE EFFECTS (the update, the session
 * deletes, the audit entry) and tolerates that throw, rather than pretending to
 * assert on a return value the mock cannot produce.
 */
describe('StudentsService.ban', () => {
  it('refuses to let an admin ban themselves', async () => {
    const { service, prisma } = makeService();
    await expect(service.ban('u1', 'a real reason', 'u1')).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    // The important half: no sessions were cleared either. A refused ban that
    // still signed the student out would be worse than no ban at all.
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to ban the last remaining admin', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ role: 'admin', bannedAt: null });
    prisma.user.count.mockResolvedValueOnce(1);

    await expect(service.ban('target', 'a real reason', 'actor')).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('counts only UNBANNED admins when deciding if this is the last one', async () => {
    // Otherwise two admins who are both banned would each look like "not the
    // last", and the platform ends up with zero people who can sign in.
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ role: 'admin', bannedAt: null });
    prisma.user.count.mockResolvedValueOnce(2);

    await service.ban('target', 'a real reason', 'actor').catch(() => undefined);
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { role: 'admin', bannedAt: null } });
  });

  it('stamps the flag AND clears every session and device, in one transaction', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ role: 'student', bannedAt: null });

    await service.ban('target', 'cheating on the final', 'actor').catch(() => undefined);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target' },
        data: expect.objectContaining({
          bannedReason: 'cheating on the final',
          bannedByUserId: 'actor',
        }),
      }),
    );
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target' } });
    expect(prisma.sessionDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target' } });
    // One transaction, not three loose writes: a ban that sets the flag and
    // then fails to clear sessions is the worst of the possible outcomes.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('writes one audit entry naming the reason', async () => {
    const { service, prisma, audit } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ role: 'student', bannedAt: null });

    await service.ban('target', 'shared their account', 'actor').catch(() => undefined);

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'student:ban',
      resourceType: 'user',
      resourceId: 'target',
      outcome: 'success',
      metadata: expect.objectContaining({ reason: 'shared their account' }),
    });
  });

  it('is idempotent — re-banning re-clears sessions rather than erroring', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ role: 'student', bannedAt: new Date() });

    await service.ban('target', 'a real reason', 'actor').catch(() => undefined);
    expect(prisma.session.deleteMany).toHaveBeenCalled();
  });

  it('throws not found for a user that does not exist', async () => {
    const { service } = makeService();
    await expect(service.ban('missing', 'a real reason', 'actor')).rejects.toThrow();
  });
});

describe('StudentsService.unban', () => {
  it('clears all three ban columns together', async () => {
    // Leaving `bannedReason` behind would show a stale reason beside an active
    // account the next time anyone opened the record.
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ bannedAt: new Date() });

    await service.unban('target', 'actor').catch(() => undefined);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'target' },
      data: { bannedAt: null, bannedReason: null, bannedByUserId: null },
    });
  });

  it('does not resurrect sessions', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ bannedAt: new Date() });

    await service.unban('target', 'actor').catch(() => undefined);
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });
});

describe('StudentsService.remove', () => {
  const INPUT = { confirmEmail: 'student@example.test', reason: 'requested removal' };

  it('refuses to let an admin delete their own account', async () => {
    const { service, prisma } = makeService();
    await expect(service.remove('u1', INPUT, 'u1')).rejects.toThrow(ForbiddenException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses when the typed email does not match the account', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: 'someone.else@example.test',
      name: 'X',
      role: 'student',
    });

    await expect(service.remove('target', INPUT, 'actor')).rejects.toThrow(BadRequestException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('accepts the email case-insensitively and trimmed', async () => {
    // The operator is retyping an address, not a password. Rejecting a capital
    // letter only teaches them to paste it, which defeats the confirmation.
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: 'Student@Example.test',
      name: 'X',
      role: 'student',
    });

    await service.remove('target', { ...INPUT, confirmEmail: '  student@example.TEST  ' }, 'actor');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'target' } });
  });

  it('refuses to delete the last remaining admin', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: INPUT.confirmEmail,
      name: 'X',
      role: 'admin',
    });
    prisma.user.count.mockResolvedValueOnce(1);

    await expect(service.remove('target', INPUT, 'actor')).rejects.toThrow(ForbiddenException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses, with counts, when the account owns authored content', async () => {
    // The four RESTRICT relations. Without this check Postgres raises a raw FK
    // violation and the admin gets a 500 they cannot act on.
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: INPUT.confirmEmail,
      name: 'X',
      role: 'student',
    });
    prisma.course.count.mockResolvedValueOnce(2);
    prisma.newsPost.count.mockResolvedValueOnce(1);

    await expect(service.remove('target', INPUT, 'actor')).rejects.toMatchObject({
      response: expect.objectContaining({
        blockers: { courses: 2, questionBankEntries: 0, questionVersions: 0, newsPosts: 1 },
      }),
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('records the refusal as a failed audit entry', async () => {
    const { service, prisma, audit } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: INPUT.confirmEmail,
      name: 'X',
      role: 'student',
    });
    prisma.questionBankEntry.count.mockResolvedValueOnce(5);

    await service.remove('target', INPUT, 'actor').catch(() => undefined);

    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'student:delete',
      outcome: 'failure',
    });
  });

  it('writes the audit entry BEFORE deleting, carrying the email and name', async () => {
    // After the row is gone `resourceId` resolves to nothing. If this entry
    // were written afterwards, or without the email, the trail would name an
    // id that can never be looked up again.
    const { service, prisma, audit } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: INPUT.confirmEmail,
      name: 'Mostafa',
      role: 'student',
    });

    const order: string[] = [];
    audit.record.mockImplementationOnce(async () => {
      order.push('audit');
      return { id: 1n, prevHash: null, hash: 'x' };
    });
    prisma.user.delete.mockImplementationOnce(async () => {
      order.push('delete');
      return {};
    });

    const result = await service.remove('target', INPUT, 'actor');

    expect(result).toEqual({ deleted: true });
    expect(order).toEqual(['audit', 'delete']);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'student:delete',
      outcome: 'success',
      metadata: expect.objectContaining({ email: INPUT.confirmEmail, name: 'Mostafa' }),
    });
  });

  it('throws not found for a user that does not exist', async () => {
    const { service } = makeService();
    await expect(service.remove('missing', INPUT, 'actor')).rejects.toThrow();
  });
});
