// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { AuditService } from '../../audit/audit.service';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { QuestionBankService } from './question-bank.service';

// The real `sanitizeRichText` (Plan 3 Task 2) is jest.mock'ed to a pass-through here: this
// spec is about VERSIONING, and a real sanitizer would only add noise. There is
// a separate assertion below that the service actually calls it.
jest.mock('../../common/sanitize/rich-text', () => ({
  sanitizeRichText: jest.fn((html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '')),
}));
const sanitizeRichText = jest.requireMock('../../common/sanitize/rich-text')
  .sanitizeRichText as jest.Mock;

describe('QuestionBankService', () => {
  let prisma: PrismaService;
  let service: QuestionBankService;
  let authorId: string;
  let categoryId: string;

  const mcq = (stem: string): QuestionInput =>
    ({
      type: 'mcq_single',
      categoryId,
      stemHtml: stem,
      defaultMark: 1,
      settings: { shuffleOptions: true, caseSensitive: false },
      options: [
        { bodyHtml: '<p>أ</p>', fraction: 1 },
        { bodyHtml: '<p>ب</p>', fraction: 0 },
      ],
    }) as QuestionInput;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    authorId = randomUUID();
    await prisma.user.create({
      data: { id: authorId, name: 'Author', email: `${authorId}@example.test`, role: 'admin' },
    });
    categoryId = (await prisma.questionCategory.create({ data: { name: `c-${authorId}` } })).id;
    service = new QuestionBankService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.questionBankEntry.deleteMany({ where: { ownerId: authorId } });
    await prisma.questionCategory.delete({ where: { id: categoryId } });
    await prisma.user.delete({ where: { id: authorId } });
    await prisma.$disconnect();
  });

  it('creates version 1 in draft', async () => {
    const created = await service.create(mcq('<p>س١</p>'), authorId);
    expect(created.version).toBe(1);
    expect(created.status).toBe('draft');
  });

  it('sanitizes the stem, the option bodies and the feedback on write', async () => {
    sanitizeRichText.mockClear();
    await service.create(
      { ...mcq('<p>س<script>alert(1)</script></p>'), generalFeedbackHtml: '<p>شرح</p>' } as QuestionInput,
      authorId,
    );
    expect(sanitizeRichText).toHaveBeenCalled();
    const stored = await prisma.questionVersion.findFirst({
      where: { createdBy: authorId },
      orderBy: { createdAt: 'desc' },
    });
    expect(stored!.stemHtml).not.toContain('<script>');
  });

  it('mutates a draft in place instead of creating a second version', async () => {
    const created = await service.create(mcq('<p>مسودة</p>'), authorId);
    const saved = await service.saveDraft(created.bankEntryId, mcq('<p>معدّلة</p>'), authorId);
    expect(saved.version).toBe(1);
    const versions = await prisma.questionVersion.count({
      where: { bankEntryId: created.bankEntryId },
    });
    expect(versions).toBe(1);
  });

  it('creates version 2 when the latest version is already published', async () => {
    const created = await service.create(mcq('<p>الأصلية</p>'), authorId);
    await service.publish(created.versionId);
    const saved = await service.saveDraft(created.bankEntryId, mcq('<p>الجديدة</p>'), authorId);
    expect(saved.version).toBe(2);
    expect(saved.status).toBe('draft');

    // Q2: the published version is untouched. This is what keeps every past
    // attempt's review screen honest.
    const original = await prisma.questionVersion.findUnique({ where: { id: created.versionId } });
    expect(original!.stemHtml).toBe('<p>الأصلية</p>');
    expect(original!.status).toBe('ready');
  });

  it('refuses to publish a question that fails its own type rules', async () => {
    const created = await service.create(mcq('<p>س</p>'), authorId);
    // Force an illegal state past the service by writing directly, the way a
    // bad import or a future bug would.
    await prisma.questionOption.updateMany({
      where: { questionVersionId: created.versionId },
      data: { fraction: 0 },
    });
    await expect(service.publish(created.versionId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('duplicates the latest ready version into a brand new entry', async () => {
    const created = await service.create(mcq('<p>للنسخ</p>'), authorId);
    await service.publish(created.versionId);
    const copyEntryId = await service.duplicate(created.bankEntryId, authorId);

    expect(copyEntryId).not.toBe(created.bankEntryId);
    const copy = await prisma.questionVersion.findFirst({
      where: { bankEntryId: copyEntryId },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    expect(copy!.version).toBe(1);
    expect(copy!.status).toBe('draft');
    expect(copy!.stemHtml).toBe('<p>للنسخ</p>');
    expect(copy!.options.map((o) => Number(o.fraction))).toEqual([1, 0]);
    // Options are COPIES, not shared rows — editing the copy must not touch
    // the original, which past attempts still point at.
    const originalOptionIds = (
      await prisma.questionOption.findMany({ where: { questionVersionId: created.versionId } })
    ).map((o) => o.id);
    expect(copy!.options.map((o) => o.id)).not.toEqual(expect.arrayContaining(originalOptionIds));
  });

  it('stores short-answer patterns raw, never HTML-encoded', async () => {
    const created = await service.create(
      {
        type: 'short_answer',
        categoryId,
        stemHtml: '<p>اكتب الشرط</p>',
        defaultMark: 1,
        settings: { caseSensitive: false, shuffleOptions: false },
        options: [{ answerPattern: 'a < b', fraction: 1 }],
      } as QuestionInput,
      authorId,
    );
    const option = await prisma.questionOption.findFirst({
      where: { questionVersionId: created.versionId },
    });
    expect(option!.answerPattern).toBe('a < b');
    expect(option!.bodyHtml).toBe('');
  });

  it('never lets a caller choose the version number or the status', async () => {
    const created = await service.create(
      { ...mcq('<p>س</p>'), version: 99, status: 'ready' } as unknown as QuestionInput,
      authorId,
    );
    expect(created.version).toBe(1);
    expect(created.status).toBe('draft');
  });

  it('imports nothing at all when any block is broken', async () => {
    const before = await prisma.questionBankEntry.count({ where: { ownerId: authorId } });
    const result = await service.bulkImport(
      'سليم\nA. أ\nB. ب\nANSWER: A\n\nمعطوب\nA. أ',
      categoryId,
      authorId,
    );
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(await prisma.questionBankEntry.count({ where: { ownerId: authorId } })).toBe(before);
  });

  it('bulk-imports questions as ready, not draft', async () => {
    const result = await service.bulkImport(
      'سؤال الاستيراد\nA. أ\nB. ب\nANSWER: A',
      categoryId,
      authorId,
    );
    expect(result.created).toBe(1);
    expect(result.errors).toEqual([]);
    const version = await prisma.questionVersion.findFirst({
      where: { createdBy: authorId, stemHtml: { contains: 'سؤال الاستيراد' } },
    });
    expect(version!.status).toBe('ready');
  });

  it('hydrates the edit form with the latest version reshaped as QuestionInput', async () => {
    const created = await service.create(mcq('<p>سؤال التحرير</p>'), authorId);
    const hydrated = await service.getForEdit(created.bankEntryId);
    expect(hydrated.version).toBe(1);
    expect(hydrated.status).toBe('draft');
    expect(hydrated.input.type).toBe('mcq_single');
    expect(hydrated.input.categoryId).toBe(categoryId);
    if (hydrated.input.type !== 'essay') {
      expect(hydrated.input.options).toHaveLength(2);
      expect(hydrated.input.options[0]).toHaveProperty('fraction');
    }
  });

  it('creates and lists categories, so the builder form always has a real categoryId to offer', async () => {
    const created = await service.createCategory(`فئة-جديدة-${authorId}`);
    const categories = await service.listCategories();
    expect(categories.map((category) => category.id)).toContain(created.id);
    await prisma.questionCategory.delete({ where: { id: created.id } });
  });
});
