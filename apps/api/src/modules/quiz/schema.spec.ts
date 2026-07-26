import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

// Integration test against the real local database. The point of these
// constraints is that they hold even when a service forgets — so testing them
// through a mock would test nothing at all.
describe('question bank schema constraints', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let userId: string;
  let categoryId: string;
  const entryIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, name: 'Bank Owner', email: `${userId}@example.test`, role: 'admin' },
    });
    const category = await prisma.questionCategory.create({ data: { name: `cat-${userId}` } });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.questionBankEntry.deleteMany({ where: { id: { in: entryIds } } });
    await prisma.questionCategory.delete({ where: { id: categoryId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  // NOTE: a version is always created in `draft` — its nested options insert
  // as a SEPARATE statement, within the same transaction, AFTER the parent
  // row. Creating the parent directly as `ready` in the same nested write
  // would make the freeze trigger see the parent already `ready` by the time
  // the option rows insert, and reject its own child rows. This mirrors
  // exactly how the real service works (Task 7): create() always writes
  // `draft`, and a later, separate publish() flips the status once the
  // options already exist.
  async function createVersion(status: 'draft' | 'ready') {
    const entry = await prisma.questionBankEntry.create({ data: { categoryId, ownerId: userId } });
    entryIds.push(entry.id);
    const version = await prisma.questionVersion.create({
      data: {
        bankEntryId: entry.id,
        version: 1,
        status: 'draft',
        type: 'mcq_single',
        stemHtml: '<p>س</p>',
        createdBy: userId,
        options: {
          create: [
            { bodyHtml: '<p>أ</p>', fraction: 1, position: 0 },
            { bodyHtml: '<p>ب</p>', fraction: 0, position: 1 },
          ],
        },
      },
    });
    if (status === 'draft') return version;
    return prisma.questionVersion.update({ where: { id: version.id }, data: { status: 'ready' } });
  }

  it('rejects a fraction above 1', async () => {
    const version = await createVersion('draft');
    await expect(
      prisma.questionOption.create({
        data: { questionVersionId: version.id, bodyHtml: '<p>ج</p>', fraction: 1.5, position: 2 },
      }),
    ).rejects.toThrow(/question_options_fraction_range/);
  });

  it('accepts a NEGATIVE fraction — negative marking is a supported feature, not a bug', async () => {
    const version = await createVersion('draft');
    const option = await prisma.questionOption.create({
      data: { questionVersionId: version.id, bodyHtml: '<p>ج</p>', fraction: -0.25, position: 2 },
    });
    expect(Number(option.fraction)).toBe(-0.25);
  });

  it('freezes the stem of a ready version', async () => {
    const version = await createVersion('ready');
    await expect(
      prisma.questionVersion.update({
        where: { id: version.id },
        data: { stemHtml: '<p>edited</p>' },
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('still allows ready -> hidden, so a question can be retired', async () => {
    const version = await createVersion('ready');
    const hidden = await prisma.questionVersion.update({
      where: { id: version.id },
      data: { status: 'hidden' },
    });
    expect(hidden.status).toBe('hidden');
  });

  it('freezes the OPTIONS of a ready version — this is what protects option_order snapshots', async () => {
    const version = await createVersion('ready');
    await expect(
      prisma.questionOption.create({
        data: { questionVersionId: version.id, bodyHtml: '<p>د</p>', fraction: 0, position: 9 },
      }),
    ).rejects.toThrow(/immutable/);
    const existing = await prisma.questionOption.findFirst({
      where: { questionVersionId: version.id },
    });
    await expect(
      prisma.questionOption.delete({ where: { id: existing!.id } }),
    ).rejects.toThrow(/immutable/);
  });

  it('has no is_correct column anywhere — fraction is the only scoring primitive', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'app' AND column_name IN ('is_correct', 'iscorrect', 'correct')
    `;
    expect(columns).toEqual([]);
  });
});
