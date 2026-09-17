import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { StudentsService } from '../modules/admin/students/students.service';

/**
 * `setPassword` must refuse any target that is not a student.
 *
 * ## The escalation this closes
 *
 * The method rewrites an account's Argon2 hash from a user id. With no check
 * on the target's role it rewrites an ADMIN's just as happily — so anybody
 * holding `student:set-password` could set a password on the platform
 * operator's account and sign in as them holding `'*'`. Worse than obvious:
 * the operator's own session was untouched, so nothing looked wrong until
 * they were next asked to log in.
 *
 * Its three siblings all guard their target's role already — `ban`,
 * `changeRole` and the delete path each refuse `target.role === 'admin'`. This
 * was the only one of the four that hands back a WORKING CREDENTIAL, and the
 * only one that did not check.
 *
 * `student:set-password` is also in `NEVER_GRANTABLE` now, so no instructor
 * can be given it at all. That is the first lock and this is the second: a
 * permission catalogue is a list somebody edits, and the guard in the code
 * path is what survives the edit.
 *
 * ## Why an integration test
 *
 * The guard reads `target.role` out of the database. A unit test with a mocked
 * Prisma would be asserting the mock.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Only the two collaborators `setPassword` actually reaches. */
const audit = { record: async () => undefined };
const service = new StudentsService(prisma as never, audit as never);

async function makeUser(role: 'admin' | 'owner' | 'student') {
  const id = randomUUID();
  await prisma.user.create({
    data: {
      id,
      name: `escalation-probe-${role}`,
      email: `${id}@escalation.invalid`,
      role,
      phoneNumber: `+2010${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`,
    },
  });
  return id;
}

describe('setPassword refuses every target that is not a student', () => {
  const created: string[] = [];

  afterAll(async () => {
    // `session`/`sessionDevice` cascade from the user; `account` does not
    // always, so it goes first.
    await prisma.account.deleteMany({ where: { userId: { in: created } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it('refuses an admin target — this is the takeover', async () => {
    const adminId = await makeUser('admin');
    created.push(adminId);

    await expect(service.setPassword(adminId, 'a-long-enough-password', 'actor')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses an owner target', async () => {
    const ownerId = await makeUser('owner');
    created.push(ownerId);

    await expect(service.setPassword(ownerId, 'a-long-enough-password', 'actor')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('writes NOTHING when it refuses', async () => {
    // A guard that throws after the upsert would be no guard at all.
    const adminId = await makeUser('admin');
    created.push(adminId);

    await expect(service.setPassword(adminId, 'a-long-enough-password', 'actor')).rejects.toThrow();

    const account = await prisma.account.findFirst({
      where: { userId: adminId, providerId: 'credential' },
    });
    expect(account).toBeNull();
  });

  it('still works on a student, and revokes their sessions', async () => {
    const studentId = await makeUser('student');
    created.push(studentId);

    await prisma.session.create({
      data: {
        id: randomUUID(),
        userId: studentId,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await expect(service.setPassword(studentId, 'a-long-enough-password', 'actor')).resolves.toEqual(
      { status: true },
    );

    const account = await prisma.account.findFirst({
      where: { userId: studentId, providerId: 'credential' },
    });
    expect(account?.password).toBeTruthy();

    // The other half: a reset that leaves the previous session alive does not
    // evict whoever the reset was performed because of.
    const sessions = await prisma.session.count({ where: { userId: studentId } });
    expect(sessions).toBe(0);
  });
});
