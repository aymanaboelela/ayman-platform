// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionController } from './session.controller';
import type { AuthenticatedUser } from './decorators/current-user.decorator';

function fakeUser(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'unused',
    email: 'unused@dev.test',
    name: 'Unused',
    emailVerified: true,
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * `onboardingCompleted` — اتضافت هنا عشان `proxy.ts` يقدر يعرف «الحساب
 * محتاج يكمّل بياناته ولا لأ» من غير ما يحتاج `profile:read` (مش موجودة
 * عند مساعد بصلاحيات محدودة — انظر كومنت `proxy.ts`'s `resolveAuthState`).
 *
 * Integration test against the real seeded database — مزل `game-banks`
 * و`taxonomy.service.spec.ts`، مش موك.
 *
 * ⚠️ الصفوف اللي التست بيقراها اتعملت هنا بالاسم، مش حساب dev-fixture محلي —
 * `design-fixture@dev.test` موجود في الداتابيز المحلي بس (`dev-design-fixture-
 * student` memory)، مش في الـCI. تست سقط فعليًا في الـCI (2026-10-02) لما
 * اعتمد على `userId` ثابت من غير ما يتأكد الصف موجود هناك كمان.
 */
describe('SessionController — onboardingCompleted', () => {
  let prisma: PrismaService;
  let controller: SessionController;
  let governorateCode: string;
  let onboardedStudentId: string;
  let bareStudentId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as PrismaService;
    await prisma.$connect();
    controller = new SessionController(prisma);

    const governorate = await prisma.governorate.findFirstOrThrow();
    governorateCode = governorate.code;

    onboardedStudentId = randomUUID();
    bareStudentId = randomUUID();
    await prisma.user.createMany({
      data: [
        { id: onboardedStudentId, name: 'Onboarded', email: `${onboardedStudentId}@example.test`, role: 'student' },
        { id: bareStudentId, name: 'Bare', email: `${bareStudentId}@example.test`, role: 'student' },
      ],
    });
    // Only the onboarded one gets a `student_profile` row — `bareStudentId`
    // is left with none, exactly like a freshly-registered account that
    // never finished the onboarding form.
    await prisma.studentProfile.create({
      data: {
        userId: onboardedStudentId,
        fullName: 'Onboarded Student',
        gender: 'male',
        phone: `010${Date.now().toString().slice(-8)}`,
        governorateCode,
        onboardingCompletedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.studentProfile.deleteMany({ where: { userId: onboardedStudentId } });
    await prisma.user.deleteMany({ where: { id: { in: [onboardedStudentId, bareStudentId] } } });
    await prisma.$disconnect();
  });

  it('is true for a non-student role, with no database read at all', async () => {
    // `role: 'owner'` — a staff account never has a `student_profile` row,
    // and onboarding is a student-only concept: it must never be the reason
    // an admin/assistant account is bounced to `/onboarding`.
    const result = await controller.me(fakeUser({ id: 'nonexistent-staff-id', role: 'owner' }));
    expect(result.onboardingCompleted).toBe(true);
  });

  it('is true for a student who finished onboarding', async () => {
    const result = await controller.me(fakeUser({ id: onboardedStudentId, role: 'student' }));
    expect(result.onboardingCompleted).toBe(true);
  });

  it('is false for a student with no profile row at all', async () => {
    const result = await controller.me(fakeUser({ id: bareStudentId, role: 'student' }));
    expect(result.onboardingCompleted).toBe(false);
  });
});
