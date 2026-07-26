// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

// Integration test against the real database. A mock here would only prove
// the mock matches itself; the entire value of these constraints is that
// Postgres enforces them.
describe('lesson_progress constraints', () => {
  // Prisma 7 requires a driver adapter at construction time — a bare
  // `new PrismaClient()` throws (see PrismaService for the same wiring).
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a completion above 1', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO app.lesson_progress (enrollment_id, lesson_id, completion, state, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), 1.5, 'in_progress', now())
      `,
    ).rejects.toThrow(/lesson_progress_completion_range/);
  });

  it('rejects a negative watched_seconds', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO app.lesson_progress (enrollment_id, lesson_id, watched_seconds, state, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), -1, 'in_progress', now())
      `,
    ).rejects.toThrow(/lesson_progress_seconds_nonnegative/);
  });

  it('rejects a completed row that does not say how it completed', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO app.lesson_progress
          (enrollment_id, lesson_id, completion, state, completed_at, completed_via, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), 1, 'completed', now(), NULL, now())
      `,
    ).rejects.toThrow(/lesson_progress_completed_has_source/);
  });

  it('rejects a completed row whose completion is not 1', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO app.lesson_progress
          (enrollment_id, lesson_id, completion, state, completed_at, completed_via, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), 0.5, 'completed', now(), 'manual', now())
      `,
    ).rejects.toThrow(/lesson_progress_completed_is_full/);
  });
});

describe('enrollments constraints', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a progress percent above 100', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO app.enrollments (id, user_id, course_id, progress_percent, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 101, now())
      `,
    ).rejects.toThrow(/enrollments_progress_range/);
  });
});

// The FK violations these inserts would ALSO trigger are irrelevant: Postgres
// evaluates CHECK constraints before referential integrity, so the CHECK name
// is what surfaces. If a test above ever fails with a foreign-key message
// instead, the CHECK was not created — fix the migration, do not relax the
// assertion.
