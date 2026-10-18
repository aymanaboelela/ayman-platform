// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { ForbiddenException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { SessionDeviceService } from '../../sessions/session-device.service';
import { StudentsService } from './students.service';

/**
 * `PATCH /api/admin/students/:userId` writes the LOGIN identity — phone and
 * email — and staff accounts carry a `StudentProfile` too. It needs
 * `student:write`, which every assistant holds, and it used to ask nothing
 * else: an assistant could rewrite an admin's phone and email, locking them
 * out, or point the email at a Google account they controlled and sign in as
 * them. Real rows, so the refusal is measured by what is still in the table.
 */
describe('StudentsService.patch — who may rewrite whose identity', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new StudentsService(prisma, new AuditService(prisma), new SessionDeviceService(prisma));

  const stamp = Date.now();
  const assistantId = `sp-assistant-${stamp}`;
  const adminId = `sp-admin-${stamp}`;
  const studentId = `sp-student-${stamp}`;
  const adminEmail = `sp-admin-${stamp}@t.test`;

  beforeAll(async () => {
    await prisma.$connect();
    const governorate = await prisma.governorate.findFirstOrThrow();
    await prisma.user.createMany({
      data: [
        { id: assistantId, name: 'مساعد', email: `sp-assistant-${stamp}@t.test`, role: 'owner' },
        { id: adminId, name: 'أدمن', email: adminEmail, role: 'admin', emailVerified: true },
        { id: studentId, name: 'طالب', email: `sp-student-${stamp}@t.test` },
      ],
    });
    const profile = (userId: string, suffix: string) => ({
      userId,
      fullName: 'اسم',
      gender: 'male' as const,
      phone: `0109${String(stamp).slice(-6)}${suffix}`,
      governorateCode: governorate.code,
      year: 2,
    });
    // `create-admin.ts` upserts a profile for every admin it makes — the row
    // this route keys on.
    await prisma.studentProfile.createMany({ data: [profile(adminId, '1'), profile(studentId, '2')] });
  });

  afterAll(async () => {
    await prisma.studentProfile.deleteMany({ where: { userId: { in: [adminId, studentId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [assistantId, adminId, studentId] } } });
    await prisma.$disconnect();
  });

  it('refuses an assistant rewriting an admin’s email, and writes nothing', async () => {
    await expect(
      service.patch(adminId, { email: `attacker-${stamp}@gmail.test` }, assistantId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { email: true } });
    expect(admin.email).toBe(adminEmail);
  });

  it('refuses an assistant rewriting an admin’s phone too', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { phoneNumber: true } });

    await expect(service.patch(adminId, { phone: '+201099999999' }, assistantId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const after = await prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { phoneNumber: true } });
    expect(after.phoneNumber).toBe(before.phoneNumber);
  });

  it('still lets the same assistant correct a student — that is what the permission is for', async () => {
    await service.patch(studentId, { schoolName: 'مدرسة النصر' }, assistantId);

    const profile = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: studentId },
      select: { schoolName: true },
    });
    expect(profile.schoolName).toBe('مدرسة النصر');
  });
});
