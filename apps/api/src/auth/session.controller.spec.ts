// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
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
 */
describe('SessionController — onboardingCompleted', () => {
  let prisma: PrismaService;
  let controller: SessionController;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as PrismaService;
    await prisma.$connect();
    controller = new SessionController(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('is true for a non-student role, with no database read at all', async () => {
    // `role: 'owner'` — a staff account never has a `student_profile` row,
    // and onboarding is a student-only concept: it must never be the reason
    // an admin/assistant account is bounced to `/onboarding`.
    const result = await controller.me(fakeUser({ id: 'nonexistent-staff-id', role: 'owner' }));
    expect(result.onboardingCompleted).toBe(true);
  });

  it('is true for a student who finished onboarding (the design-fixture account)', async () => {
    const result = await controller.me(
      fakeUser({ id: 'MgfMERNsk2FI3YiA11UjTZkkAHo4idn3', role: 'student' }),
    );
    expect(result.onboardingCompleted).toBe(true);
  });

  it('is false for a student with no profile row at all', async () => {
    const result = await controller.me(fakeUser({ id: 'nonexistent-student-id', role: 'student' }));
    expect(result.onboardingCompleted).toBe(false);
  });
});
