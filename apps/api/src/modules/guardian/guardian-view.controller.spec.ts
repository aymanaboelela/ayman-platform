// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Request } from 'express';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { GUARDIAN_COOKIE } from './guardian-cookie';
import { GuardianSessionService } from './guardian-session.service';
import { GuardianViewController } from './guardian-view.controller';

/**
 * A guardian session is a 14-day signed cookie. It used to be checked for its
 * signature and nothing else, so it outlived both things that let it in: the
 * code it was opened with (replaced because it leaked) and the student not
 * being banned. Real rows; the dashboard and report behind the gate are stubs,
 * because the gate is what is measured.
 */
describe('GuardianViewController.me — the session is re-checked on every read', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  // No attempt counter is exercised here — a code that is right never counts.
  const redis = { pttl: async () => -2, incr: async () => 1, expire: async () => 1, set: async () => 'OK', del: async () => 1 };
  const sessions = new GuardianSessionService(prisma, redis as never, 'g'.repeat(32));
  const controller = new GuardianViewController(
    sessions,
    { forUser: async () => ({}) } as never,
    { forStudent: async () => ({}) } as never,
    prisma,
  );

  const stamp = Date.now();
  const studentId = `gv-student-${stamp}`;

  const requestWith = (token: string) =>
    ({ headers: { cookie: `${GUARDIAN_COOKIE}=${token}` } }) as unknown as Request;

  async function signIn(): Promise<string> {
    const { guardianCode } = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: studentId },
      select: { guardianCode: true },
    });
    const result = await sessions.signIn(guardianCode, '203.0.113.9');
    if (!result.ok) throw new Error('the real code was refused');
    return result.token;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const governorate = await prisma.governorate.findFirstOrThrow();
    await prisma.user.create({ data: { id: studentId, name: 'طالب', email: `${studentId}@t.test` } });
    await prisma.studentProfile.create({
      data: {
        userId: studentId,
        fullName: 'طالب الاختبار',
        gender: 'female',
        phone: `0108${String(stamp).slice(-7)}`,
        governorateCode: governorate.code,
        year: 2,
      },
    });
  });

  afterEach(async () => {
    await prisma.user.update({ where: { id: studentId }, data: { bannedAt: null } });
  });

  afterAll(async () => {
    await prisma.studentProfile.deleteMany({ where: { userId: studentId } });
    await prisma.user.deleteMany({ where: { id: studentId } });
    await prisma.$disconnect();
  });

  it('opens the student’s page with the current code', async () => {
    const token = await signIn();
    await expect(controller.me(requestWith(token))).resolves.toMatchObject({
      student: { name: 'طالب الاختبار' },
    });
  });

  it('closes a session opened with a code that has since been replaced', async () => {
    const token = await signIn();
    // The database's own generator — what a rotation writes.
    await prisma.$executeRaw`UPDATE app.student_profiles SET guardian_code = app.new_guardian_code() WHERE user_id = ${studentId}`;

    await expect(controller.me(requestWith(token))).rejects.toBeInstanceOf(UnauthorizedException);
    // The new code opens it again.
    await expect(controller.me(requestWith(await signIn()))).resolves.toMatchObject({
      student: { name: 'طالب الاختبار' },
    });
  });

  it('closes a session once the student is banned', async () => {
    const token = await signIn();
    await prisma.user.update({ where: { id: studentId }, data: { bannedAt: new Date() } });

    await expect(controller.me(requestWith(token))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
