import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  emailIdentifier,
  phoneIdentifier,
  throttleKeyFor,
} from '../../../auth/credential-check.service';
import { loginThrottle } from '../../../auth/login-throttle.instance';
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
    // `StudentsService.setPassword` — the `credential` account, upserted on
    // `(providerId, accountId)`, same shape `create-admin.ts` bootstraps with.
    account: {
      upsert: jest.fn(async () => ({})),
    },
    // حظر deletes these two alongside stamping the flag; the tests below assert
    // that, because the flag on its own locks nobody out.
    session: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    accessGrant: { findFirst: jest.fn(async () => null as unknown), findMany: jest.fn(async () => []), update: jest.fn(async () => ({})) },
    enrollment: { updateMany: jest.fn(async () => ({ count: 0 })) },
    sessionDevice: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    // The four `ON DELETE RESTRICT` relations `remove()` counts before it tries.
    course: { count: jest.fn(async () => 0), findUnique: jest.fn(async () => null as unknown) },
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

  it('writes an ordinary profile field straight to StudentProfile, with no user write', async () => {
    const { service, prisma } = makeService();
    prisma.studentProfile.findUnique.mockResolvedValueOnce({ userId: 'u1', year: 2, trackId: null });

    await service.patch('u1', { schoolName: 'مدرسة النصر' }).catch(() => undefined);

    expect(prisma.studentProfile.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { schoolName: 'مدرسة النصر' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('accepts a school stream change', async () => {
    const { service, prisma } = makeService();
    prisma.studentProfile.findUnique.mockResolvedValueOnce({ userId: 'u1', year: 2, trackId: null });

    await service.patch('u1', { schoolStream: 'languages' }).catch(() => undefined);

    expect(prisma.studentProfile.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { schoolStream: 'languages' },
    });
  });

  /**
   * `phone` mirrors `User.phoneNumber` — the actual Better Auth login
   * identifier — onto `StudentProfile.phone`. A change must land in BOTH
   * tables, in one transaction, or the mirror desyncs from the account an
   * admin just retyped a number into.
   */
  it('writes a phone change to BOTH StudentProfile.phone and User.phoneNumber, in one transaction', async () => {
    const { service, prisma } = makeService();
    prisma.studentProfile.findUnique.mockResolvedValueOnce({ userId: 'u1', year: 2, trackId: null });

    await service.patch('u1', { phone: '+201012345678' }).catch(() => undefined);

    expect(prisma.studentProfile.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { phone: '+201012345678' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { phoneNumber: '+201012345678' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('writes an email change to User only, not StudentProfile', async () => {
    const { service, prisma } = makeService();
    prisma.studentProfile.findUnique.mockResolvedValueOnce({ userId: 'u1', year: 2, trackId: null });

    await service.patch('u1', { email: 'student@example.test' }).catch(() => undefined);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { email: 'student@example.test' },
    });
    // No OTHER student_profile fields were sent, so nothing to write there.
    expect(prisma.studentProfile.update).not.toHaveBeenCalled();
  });

  it('clears email back to null', async () => {
    const { service, prisma } = makeService();
    prisma.studentProfile.findUnique.mockResolvedValueOnce({ userId: 'u1', year: 2, trackId: null });

    await service.patch('u1', { email: null }).catch(() => undefined);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { email: null },
    });
  });

  it('turns a unique-constraint violation into a readable conflict', async () => {
    const { service, prisma } = makeService();
    prisma.studentProfile.findUnique.mockResolvedValueOnce({ userId: 'u1', year: 2, trackId: null });
    prisma.$transaction.mockImplementationOnce(async () => {
      throw { code: 'P2002' };
    });

    await expect(service.patch('u1', { phone: '+201012345678' })).rejects.toThrow(
      /already used by another account/,
    );
  });
});

describe('StudentsService.setPassword', () => {
  it('throws not found for a user that does not exist', async () => {
    const { service } = makeService();
    await expect(service.setPassword('missing', 'a-real-password', 'actor')).rejects.toThrow();
  });

  it('upserts the credential account on (providerId, accountId), keyed by userId', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' });

    const result = await service.setPassword('u1', 'a-real-password', 'actor');

    expect(result).toEqual({ status: true });
    expect(prisma.account.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.account.upsert.mock.calls[0]![0] as {
      where: { providerId_accountId: { providerId: string; accountId: string } };
      update: { password: string };
      create: { providerId: string; accountId: string; userId: string; password: string };
    };
    expect(call.where).toEqual({
      providerId_accountId: { providerId: 'credential', accountId: 'u1' },
    });
    // Never the plaintext password — Argon2id output is a $argon2id$… string.
    expect(call.update.password).toMatch(/^\$argon2id\$/);
    expect(call.create.providerId).toBe('credential');
    expect(call.create.accountId).toBe('u1');
    expect(call.create.userId).toBe('u1');
    expect(call.create.password).toMatch(/^\$argon2id\$/);
  });

  it('writes one audit entry naming the actor, never the password', async () => {
    const { service, prisma, audit } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' });

    await service.setPassword('u1', 'a-real-password', 'actor');

    expect(audit.record).toHaveBeenCalledTimes(1);
    const entry = audit.record.mock.calls[0]![0];
    expect(entry).toMatchObject({
      action: 'student:set-password',
      resourceType: 'user',
      resourceId: 'u1',
      outcome: 'success',
      metadata: { actorUserId: 'actor' },
    });
    expect(JSON.stringify(entry)).not.toContain('a-real-password');
  });

  /**
   * The regression this method was quietly failing at: the password DID
   * change, and the student still could not get in with it.
   *
   * `throttleKeyFor` gives a phone and an email their own soft-lock buckets,
   * so a student who burned ten attempts on their number stayed locked out of
   * the number while the identical new password sailed through the email box —
   * which is exactly what «غيّرت الباسورد وهي لسه مش عارفة تدخل» looked like
   * from the admin's side. Both buckets, or the fix only covers whichever
   * identifier the student did not happen to be using.
   */
  it('drops the soft lock on both identifiers, so the new password works on the first try', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      // Mixed case on purpose — `emailIdentifier` folds it, and the key this
      // clears has to be the one a failed attempt actually wrote.
      email: 'Shrouk@Example.com',
      phoneNumber: '+201153689519',
    });

    const phoneKey = throttleKeyFor(phoneIdentifier('+201153689519'));
    const emailKey = throttleKeyFor(emailIdentifier('shrouk@example.com'));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      loginThrottle.recordFailure(phoneKey, '203.0.113.7');
      loginThrottle.recordFailure(emailKey, '203.0.113.7');
    }
    expect(loginThrottle.isLocked(phoneKey)).toBe(true);
    expect(loginThrottle.isLocked(emailKey)).toBe(true);

    await service.setPassword('u1', 'a-real-password', 'actor');

    expect(loginThrottle.isLocked(phoneKey)).toBe(false);
    expect(loginThrottle.isLocked(emailKey)).toBe(false);
  });

  // A phone-only account has `email: null` (the placeholder is stripped before
  // the row is written — see `databaseHooks.user.create.before`). Nothing to
  // unlock on that side, and reading it as a key would throw.
  it('unlocks a phone-only account without touching an email key', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: null,
      phoneNumber: '+201010000001',
    });

    const phoneKey = throttleKeyFor(phoneIdentifier('+201010000001'));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      loginThrottle.recordFailure(phoneKey, '203.0.113.7');
    }

    await expect(service.setPassword('u1', 'a-real-password', 'actor')).resolves.toEqual({
      status: true,
    });
    expect(loginThrottle.isLocked(phoneKey)).toBe(false);
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
  const INPUT = { confirmIdentity: '+201012345678', reason: 'requested removal' };

  it('refuses to let an admin delete their own account', async () => {
    const { service, prisma } = makeService();
    await expect(service.remove('u1', INPUT, 'u1')).rejects.toThrow(ForbiddenException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses when the typed identifier does not match the account', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: 'someone.else@example.test',
      phoneNumber: '+201119999999',
      name: 'X',
      role: 'student',
    });

    await expect(service.remove('target', INPUT, 'actor')).rejects.toThrow(BadRequestException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('accepts the identifier trimmed', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: 'student@example.test',
      phoneNumber: '+201012345678',
      name: 'X',
      role: 'student',
    });

    await service.remove('target', { ...INPUT, confirmIdentity: '  +201012345678  ' }, 'actor');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'target' } });
  });

  /**
   * The PHONE wins whenever the account has one, even though the email is
   * also a perfectly real string. It is the identifier an operator recognises
   * for a student, and having one rule rather than "whichever they happen to
   * type" is what makes the dialog's hint always correct.
   */
  it('demands the phone, not the email, when the account has both', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: 'student@example.test',
      phoneNumber: '+201012345678',
      name: 'X',
      role: 'student',
    });

    await expect(
      service.remove('target', { ...INPUT, confirmIdentity: 'student@example.test' }, 'actor'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  /**
   * Accounts that predate the phone column — and every admin — genuinely have
   * no number, and must stay deletable.
   */
  it('falls back to the email for an account with no phone', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: 'Student@Example.test',
      phoneNumber: null,
      name: 'X',
      role: 'student',
    });

    await service.remove(
      'target',
      { ...INPUT, confirmIdentity: '  student@example.TEST  ' },
      'actor',
    );
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'target' } });
  });

  /**
   * Fails CLOSED. Both columns are nullable now — `email` genuinely so, and
   * `phoneNumber` for accounts that predate it — so an account with neither is
   * representable, and it has nothing a human could be asked to retype. A
   * destructive action with no confirmation available must be refused rather
   * than waved through.
   */
  it('refuses outright when the account has no human-readable identifier', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: null,
      phoneNumber: null,
      name: 'X',
      role: 'student',
    });

    await expect(
      service.remove('target', { ...INPUT, confirmIdentity: 'anything at all' }, 'actor'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete the last remaining admin', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce({
      email: 'student@example.test',
      phoneNumber: INPUT.confirmIdentity,
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
      email: 'student@example.test',
      phoneNumber: INPUT.confirmIdentity,
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
      email: 'student@example.test',
      phoneNumber: INPUT.confirmIdentity,
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
      email: 'student@example.test',
      phoneNumber: INPUT.confirmIdentity,
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
      metadata: expect.objectContaining({ phone: INPUT.confirmIdentity, name: 'Mostafa' }),
    });
  });

  it('throws not found for a user that does not exist', async () => {
    const { service } = makeService();
    await expect(service.remove('missing', INPUT, 'actor')).rejects.toThrow();
  });
});

/**
 * مسح مجموعة.
 *
 * Every test here asserts on what happened to the ACCOUNTS — which ids reached
 * `user.delete` and which did not — rather than on the shape of the report.
 * A bulk delete that returns a beautifully-formed `{ deleted: [...] }` while
 * having deleted the wrong rows is the only failure mode of this method that
 * matters, and it is invisible to a test that reads the return value alone.
 */
describe('StudentsService.removeMany', () => {
  const REASON = 'duplicate signups';
  const student = (email: string) => ({ email, name: email, role: 'student' });

  function deletedIds(prisma: ReturnType<typeof makeService>['prisma']): string[] {
    return prisma.user.delete.mock.calls.map((call) => (call[0] as { where: { id: string } }).where.id);
  }

  it('deletes every selected account', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique
      .mockResolvedValueOnce(student('a@x.test'))
      .mockResolvedValueOnce(student('b@x.test'));

    const result = await service.removeMany({ userIds: ['a', 'b'], reason: REASON }, 'actor');

    expect(deletedIds(prisma)).toEqual(['a', 'b']);
    expect(result).toEqual({ deleted: ['a', 'b'], failed: [] });
  });

  it('deletes the rest when one account is blocked by authored content', async () => {
    // The whole reason this is not one transaction: an admin who selects twenty
    // rows and has one instructor among them wants the nineteen gone, not a
    // rollback and no way to tell which row stopped it.
    const { service, prisma } = makeService();
    prisma.user.findUnique
      .mockResolvedValueOnce(student('a@x.test'))
      .mockResolvedValueOnce({ email: 'author@x.test', name: 'Author', role: 'student' })
      .mockResolvedValueOnce(student('c@x.test'));
    prisma.course.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);

    const result = await service.removeMany({ userIds: ['a', 'b', 'c'], reason: REASON }, 'actor');

    expect(deletedIds(prisma)).toEqual(['a', 'c']);
    expect(result.failed).toEqual([
      { userId: 'b', name: 'Author', reason: 'authored-content' },
    ]);
  });

  it('refuses the actor’s own account without dropping the others', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce(student('a@x.test'));

    const result = await service.removeMany({ userIds: ['actor', 'a'], reason: REASON }, 'actor');

    expect(deletedIds(prisma)).toEqual(['a']);
    expect(result.failed).toEqual([{ userId: 'actor', name: '', reason: 'self' }]);
  });

  it('re-counts admins per account, so the last one alive is still refused', async () => {
    /*
     * Two admins selected, two admins in existence. Deleting them in parallel
     * would have both read a count of two, both pass, and lock everyone out of
     * the platform — the count below drops to one because the first delete
     * already happened, which only holds if these run in sequence.
     */
    const { service, prisma } = makeService();
    prisma.user.findUnique
      .mockResolvedValueOnce({ email: 'one@x.test', name: 'One', role: 'admin' })
      .mockResolvedValueOnce({ email: 'two@x.test', name: 'Two', role: 'admin' });
    prisma.user.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const result = await service.removeMany({ userIds: ['one', 'two'], reason: REASON }, 'actor');

    expect(deletedIds(prisma)).toEqual(['one']);
    expect(result.failed).toEqual([{ userId: 'two', name: 'Two', reason: 'last-admin' }]);
  });

  it('deletes a repeated id once rather than reporting the second as missing', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce(student('a@x.test'));

    const result = await service.removeMany({ userIds: ['a', 'a'], reason: REASON }, 'actor');

    expect(deletedIds(prisma)).toEqual(['a']);
    expect(result).toEqual({ deleted: ['a'], failed: [] });
  });

  it('reports an account that no longer exists instead of throwing', async () => {
    // Two tabs open, the other one got there first. A 404 here would abandon
    // the rest of the selection over a row that is already in the desired state.
    const { service, prisma } = makeService();
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(student('b@x.test'));

    const result = await service.removeMany({ userIds: ['gone', 'b'], reason: REASON }, 'actor');

    expect(deletedIds(prisma)).toEqual(['b']);
    expect(result.failed).toEqual([{ userId: 'gone', name: '', reason: 'not-found' }]);
  });

  it('writes one audit entry per account, carrying the reason', async () => {
    const { service, prisma, audit } = makeService();
    prisma.user.findUnique
      .mockResolvedValueOnce(student('a@x.test'))
      .mockResolvedValueOnce(student('b@x.test'));

    await service.removeMany({ userIds: ['a', 'b'], reason: REASON }, 'actor');

    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record.mock.calls[1][0]).toMatchObject({
      action: 'student:delete',
      outcome: 'success',
      metadata: expect.objectContaining({ reason: REASON, actorUserId: 'actor' }),
    });
  });
});

/**
 * Revoking a course grant.
 *
 * These exist because the previous implementation passed every test it had
 * while doing nothing to the student's actual access: it stamped `revokedAt`
 * and returned, and every gate in the product reads `enrollments.status`.
 * So each test below asserts on the ENROLLMENT, not on the grant row — the
 * grant row was never the thing that was broken.
 *
 * `listGrants` runs at the end and reads `accessGrant.findMany`, which the mock
 * answers with `[]`; that is enough for these to reach their assertions.
 */
describe('StudentsService.revokeGrant', () => {
  it('closes the enrollment, not just the grant row', async () => {
    const { service, prisma } = makeService();
    prisma.accessGrant.findFirst.mockResolvedValueOnce({
      id: 'g1',
      revokedAt: null,
      courseId: 'c1',
    });
    prisma.course.findUnique.mockResolvedValueOnce({ requiresGrant: true });

    await service.revokeGrant('u1', 'g1');

    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', courseId: 'c1' },
      data: { status: 'revoked' },
    });
  });

  it('writes the grant stamp and the enrollment close in ONE transaction', async () => {
    // Half-applied is the worst outcome: a grant that reads «مسحوب» beside an
    // enrollment that still opens every lesson is exactly the bug this fixes.
    const { service, prisma } = makeService();
    prisma.accessGrant.findFirst.mockResolvedValueOnce({
      id: 'g1',
      revokedAt: null,
      courseId: 'c1',
    });
    prisma.course.findUnique.mockResolvedValueOnce({ requiresGrant: true });

    await service.revokeGrant('u1', 'g1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it('leaves the enrollment alone when the course no longer requires a grant', async () => {
    // Revoking a leftover grant on a course that has since been opened must
    // not lock a student out of what is now a free course.
    const { service, prisma } = makeService();
    prisma.accessGrant.findFirst.mockResolvedValueOnce({
      id: 'g1',
      revokedAt: null,
      courseId: 'c1',
    });
    prisma.course.findUnique.mockResolvedValueOnce({ requiresGrant: false });

    await service.revokeGrant('u1', 'g1');
    expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
  });

  it('still closes the enrollment when the grant was already revoked', async () => {
    // The repair path: a grant revoked BEFORE this fix shipped left the
    // enrollment open. Pressing revoke again must fix that rather than
    // short-circuit on `alreadyRevoked` and change nothing.
    const { service, prisma } = makeService();
    prisma.accessGrant.findFirst.mockResolvedValueOnce({
      id: 'g1',
      revokedAt: new Date(),
      courseId: 'c1',
    });
    prisma.course.findUnique.mockResolvedValueOnce({ requiresGrant: true });

    await service.revokeGrant('u1', 'g1');
    expect(prisma.enrollment.updateMany).toHaveBeenCalled();
    expect(prisma.accessGrant.update).not.toHaveBeenCalled();
  });

  it('refuses a grant id belonging to another student', async () => {
    const { service, prisma } = makeService();
    await expect(service.revokeGrant('u1', 'someone-elses-grant')).rejects.toThrow();
    expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
  });

  it('records whether access actually changed', async () => {
    const { service, prisma, audit } = makeService();
    prisma.accessGrant.findFirst.mockResolvedValueOnce({
      id: 'g1',
      revokedAt: null,
      courseId: 'c1',
    });
    prisma.course.findUnique.mockResolvedValueOnce({ requiresGrant: true });

    await service.revokeGrant('u1', 'g1');
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'student:revoke-course',
      metadata: expect.objectContaining({ enrollmentRevoked: true }),
    });
  });
});
