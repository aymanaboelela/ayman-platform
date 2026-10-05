// Prisma 7 doesn't auto-load .env — same reason as `question-bank.service.spec.ts`.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { copy } from '@ayman/contracts/copy';
import { PublishDraftsRequestSchema } from '@ayman/contracts/quiz/publish-drafts';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { challengeCandidates } from './challenge-pool';
import { QuestionBankService } from './question-bank.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

/**
 * «انشر المسودات» on Postgres, asserted by what a STUDENT gets: a draft is not
 * in the challenge pool, the same question after a bulk publish is — and the
 * questions outside the scope (a ready one beside it, a draft in another
 * category, one «امسح» put away) are exactly as they were.
 */
describe('QuestionBankService.publishDrafts', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const bank = new QuestionBankService(prisma, new AuditService(prisma));

  let fixture: QuizFixture;
  const categories: string[] = [];

  async function category(): Promise<string> {
    const created = await prisma.questionCategory.create({ data: { name: `مسودات-${randomUUID()}` } });
    categories.push(created.id);
    return created.id;
  }

  /** An mcq on the fixture's lesson, so the challenge pool counts it once it is ready. */
  async function question(
    categoryId: string,
    options: { ready?: boolean; broken?: boolean; archived?: boolean } = {},
  ): Promise<{ bankEntryId: string; versionId: string }> {
    const entry = await prisma.questionBankEntry.create({
      data: {
        categoryId,
        ownerId: fixture.adminId,
        lessonId: fixture.lessonId,
        variantGroupKey: 'loop-1',
        archivedAt: options.archived ? new Date() : null,
      },
    });
    const version = await prisma.questionVersion.create({
      data: {
        bankEntryId: entry.id,
        version: 1,
        status: 'draft',
        type: 'mcq_single',
        stemHtml: '<p>صيغة</p>',
        generalFeedbackHtml: '<p>الشرح</p>',
        createdBy: fixture.adminId,
        options: {
          create: [
            // `broken`: no correct option — what a generated paste can carry,
            // and what `publish()` re-validation exists to refuse.
            { bodyHtml: '<p>صح</p>', fraction: options.broken ? 0 : 1, position: 0 },
            { bodyHtml: '<p>غلط</p>', fraction: 0, position: 1 },
          ],
        },
      },
    });
    if (options.ready) await prisma.questionVersion.update({ where: { id: version.id }, data: { status: 'ready' } });
    return { bankEntryId: entry.id, versionId: version.id };
  }

  async function pool(): Promise<Set<string>> {
    const rows = await challengeCandidates(prisma, [fixture.courseId], null);
    return new Set(rows.map((row) => row.versionId));
  }

  async function status(versionId: string) {
    return (await prisma.questionVersion.findUniqueOrThrow({ where: { id: versionId }, select: { status: true } })).status;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    fixture = await seedQuizFixture(prisma);
  });

  afterEach(async () => {
    // The audit rows stay: `audit_log` is INSERT-only for the runtime role.
    await prisma.questionBankEntry.deleteMany({ where: { categoryId: { in: categories } } });
    await prisma.questionCategory.deleteMany({ where: { id: { in: categories } } });
    categories.length = 0;
    await fixture.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('publishes every draft of the category into the challenge pool, and touches nothing outside it', async () => {
    const mine = await category();
    const other = await category();
    const draftA = await question(mine);
    const draftB = await question(mine);
    const broken = await question(mine, { broken: true });
    const ready = await question(mine, { ready: true });
    const archived = await question(mine, { archived: true });
    const elsewhere = await question(other);
    const readyBefore = await prisma.questionVersion.findUniqueOrThrow({ where: { id: ready.versionId } });

    const before = await pool();
    expect(before.has(draftA.versionId)).toBe(false);
    expect(before.has(draftB.versionId)).toBe(false);
    expect(before.has(ready.versionId)).toBe(true);

    const result = await bank.publishDrafts({ categoryId: mine });

    expect(result.published).toBe(2);
    expect(result.failed).toEqual([
      { versionId: broken.versionId, bankEntryId: broken.bankEntryId, message: copy.quizErrors.exactlyOneCorrect },
    ]);

    const after = await pool();
    expect(after.has(draftA.versionId)).toBe(true);
    expect(after.has(draftB.versionId)).toBe(true);
    expect(after.has(ready.versionId)).toBe(true);
    // The broken one would not validate — still a draft, still out of reach.
    expect(await status(broken.versionId)).toBe('draft');
    expect(after.has(broken.versionId)).toBe(false);
    // Another category's draft is not this button's business.
    expect(await status(elsewhere.versionId)).toBe('draft');
    expect(after.has(elsewhere.versionId)).toBe(false);
    // «امسح» put this one away; a sweep must not bring it back as ready.
    expect(await status(archived.versionId)).toBe('draft');

    // The ready question is the same row it was: no new version, nothing rewritten.
    const readyAfter = await prisma.questionVersion.findUniqueOrThrow({ where: { id: ready.versionId } });
    expect(readyAfter).toEqual(readyBefore);
    expect(await prisma.questionVersion.count({ where: { bankEntryId: ready.bankEntryId } })).toBe(1);

    // The same side effects as the single button: one `question:publish` row
    // per published version, plus one row for the bulk act itself.
    const perVersion = await prisma.auditLog.count({
      where: { action: 'question:publish', resourceId: { in: [draftA.versionId, draftB.versionId, broken.versionId] } },
    });
    expect(perVersion).toBe(2);
    const bulk = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'question:publish-drafts', resourceId: mine },
    });
    expect(bulk.outcome).toBe('failure');
    expect(bulk.metadata).toMatchObject({ scope: 'category', published: 2, failed: [broken.versionId] });

    // And the bank's own numbers agree: the category has one draft left.
    const listed = await bank.listCategories();
    expect(listed.find((row) => row.id === mine)?.draftCount).toBe(1);
    expect(listed.find((row) => row.id === other)?.draftCount).toBe(1);
  });

  it('publishes exactly the ticked versions, and an id that is not a draft any more is not an error', async () => {
    const mine = await category();
    const ticked = await question(mine);
    const unticked = await question(mine);
    const ready = await question(mine, { ready: true });

    const result = await bank.publishDrafts({ versionIds: [ticked.versionId, ready.versionId, randomUUID()] });

    expect(result).toEqual({ published: 1, failed: [] });
    expect(await status(ticked.versionId)).toBe('ready');
    expect(await status(unticked.versionId)).toBe('draft');
    const after = await pool();
    expect(after.has(ticked.versionId)).toBe(true);
    expect(after.has(unticked.versionId)).toBe(false);
  });

  it('lists the drafts, the ready ones, and variants side by side', async () => {
    const mine = await category();
    const draft = await question(mine);
    const ready = await question(mine, { ready: true });

    const drafts = await bank.list({ categoryId: mine, status: 'draft', take: 50, skip: 0 });
    expect(drafts.rows.map((row) => row.id)).toEqual([draft.bankEntryId]);
    expect(drafts.rows[0]?.variantGroupKey).toBe('loop-1');
    expect(drafts.rows[0]?.versions[0]?.generalFeedbackHtml).toBe('<p>الشرح</p>');

    const readyRows = await bank.list({ categoryId: mine, status: 'ready', take: 50, skip: 0 });
    expect(readyRows.rows.map((row) => row.id)).toEqual([ready.bankEntryId]);

    const both = await bank.list({ categoryId: mine, sort: 'group', take: 50, skip: 0 });
    expect(both.rowCount).toBe(2);
  });

  it('refuses a body with both scopes or neither', () => {
    expect(PublishDraftsRequestSchema.safeParse({ categoryId: randomUUID() }).success).toBe(true);
    expect(PublishDraftsRequestSchema.safeParse({ versionIds: [randomUUID()] }).success).toBe(true);
    expect(PublishDraftsRequestSchema.safeParse({}).success).toBe(false);
    expect(
      PublishDraftsRequestSchema.safeParse({ categoryId: randomUUID(), versionIds: [randomUUID()] }).success,
    ).toBe(false);
    expect(
      PublishDraftsRequestSchema.safeParse({ versionIds: Array.from({ length: 501 }, () => randomUUID()) }).success,
    ).toBe(false);
  });
});
