import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { QuestionInputSchema, type QuestionInput } from '@ayman/contracts/quiz/question';
import { parseQuestionBlocks, type ImportError } from '@ayman/contracts/quiz/import';
import { copy } from '@ayman/contracts/copy';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import type { QuestionStatus, QuestionType } from '../../generated/prisma/enums';

export interface QuestionVersionSummary {
  bankEntryId: string;
  versionId: string;
  version: number;
  status: QuestionStatus;
  type: QuestionType;
}

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rows are built field by field from the PARSED input. There is no
   * `data: dto` spread anywhere in this file — `version`, `status`,
   * `createdBy` and every option id are server-decided, so a payload carrying
   * `{ version: 99, status: 'ready' }` changes nothing.
   */
  private optionRows(input: QuestionInput) {
    if (input.type === 'essay') return [];
    if (input.type === 'short_answer') {
      return input.options.map((option, index) => ({
        // A short-answer pattern must NOT be sanitized: HTML-encoding `<`
        // would silently break `a < b`. The review screen renders it as text.
        bodyHtml: '',
        answerPattern: option.answerPattern,
        fraction: option.fraction,
        feedbackHtml: option.feedbackHtml ? sanitizeRichText(option.feedbackHtml) : null,
        position: index,
      }));
    }
    return input.options.map((option, index) => ({
      bodyHtml: sanitizeRichText(option.bodyHtml),
      answerPattern: null,
      fraction: option.fraction,
      feedbackHtml: option.feedbackHtml ? sanitizeRichText(option.feedbackHtml) : null,
      position: index,
    }));
  }

  private versionRow(input: QuestionInput, authorId: string) {
    return {
      type: input.type,
      stemHtml: sanitizeRichText(input.stemHtml),
      generalFeedbackHtml: input.generalFeedbackHtml
        ? sanitizeRichText(input.generalFeedbackHtml)
        : null,
      defaultMark: input.defaultMark,
      settings: input.settings,
      createdBy: authorId,
    };
  }

  async create(input: QuestionInput, authorId: string): Promise<QuestionVersionSummary> {
    const parsed = QuestionInputSchema.parse(input);
    const entry = await this.prisma.questionBankEntry.create({
      data: {
        categoryId: parsed.categoryId,
        ownerId: authorId,
        versions: {
          create: {
            version: 1,
            status: 'draft',
            ...this.versionRow(parsed, authorId),
            options: { create: this.optionRows(parsed) },
          },
        },
      },
      include: { versions: true },
    });
    const version = entry.versions[0]!;
    return {
      bankEntryId: entry.id,
      versionId: version.id,
      version: version.version,
      status: version.status,
      type: version.type,
    };
  }

  /**
   * Editing rule, and the reason review screens stay correct forever:
   *   latest is `draft`  → mutate it in place (options are replaced wholesale)
   *   latest is `ready`  → create version N+1 as a fresh draft
   * The database trigger from Task 1 enforces the second branch even if this
   * method is bypassed.
   */
  async saveDraft(
    bankEntryId: string,
    input: QuestionInput,
    authorId: string,
  ): Promise<QuestionVersionSummary> {
    const parsed = QuestionInputSchema.parse(input);
    const latest = await this.prisma.questionVersion.findFirst({
      where: { bankEntryId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, status: true },
    });
    if (!latest) throw new NotFoundException();

    return this.prisma.$transaction(async (tx) => {
      if (latest.status === 'draft') {
        await tx.questionOption.deleteMany({ where: { questionVersionId: latest.id } });
        const updated = await tx.questionVersion.update({
          where: { id: latest.id },
          data: {
            ...this.versionRow(parsed, authorId),
            options: { create: this.optionRows(parsed) },
          },
        });
        await tx.questionBankEntry.update({
          where: { id: bankEntryId },
          data: { categoryId: parsed.categoryId },
        });
        return {
          bankEntryId,
          versionId: updated.id,
          version: updated.version,
          status: updated.status,
          type: updated.type,
        };
      }

      const created = await tx.questionVersion.create({
        data: {
          bankEntryId,
          version: latest.version + 1,
          status: 'draft',
          ...this.versionRow(parsed, authorId),
          options: { create: this.optionRows(parsed) },
        },
      });
      await tx.questionBankEntry.update({
        where: { id: bankEntryId },
        data: { categoryId: parsed.categoryId },
      });
      return {
        bankEntryId,
        versionId: created.id,
        version: created.version,
        status: created.status,
        type: created.type,
      };
    });
  }

  /**
   * Publishing re-validates the STORED rows through the same shared schema the
   * form used. A question that reached the database through a bulk import, a
   * migration or a bug never becomes `ready` in an ungradeable state.
   */
  async publish(versionId: string): Promise<void> {
    const version = await this.prisma.questionVersion.findUnique({
      where: { id: versionId },
      include: { options: { orderBy: { position: 'asc' } }, bankEntry: true },
    });
    if (!version) throw new NotFoundException();
    if (version.status !== 'draft') return;

    const candidate = {
      type: version.type,
      categoryId: version.bankEntry.categoryId,
      stemHtml: version.stemHtml,
      generalFeedbackHtml: version.generalFeedbackHtml ?? undefined,
      defaultMark: Number(version.defaultMark),
      settings: version.settings,
      options: version.options.map((option) =>
        version.type === 'short_answer'
          ? { answerPattern: option.answerPattern ?? '', fraction: Number(option.fraction) }
          : { bodyHtml: option.bodyHtml, fraction: Number(option.fraction) },
      ),
    };

    const result = QuestionInputSchema.safeParse(candidate);
    if (!result.success) {
      throw new BadRequestException({
        message: copy.quizErrors.exactlyOneCorrect,
        issues: result.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    await this.prisma.questionVersion.update({
      where: { id: versionId },
      data: { status: 'ready' },
    });
  }

  /**
   * Hydrates the admin form. Returns the LATEST version (draft if one
   * exists, otherwise the newest ready one) reshaped into exactly the
   * `QuestionInput` the form's `zodResolver(QuestionInputSchema)` expects —
   * so editing an existing question and creating a new one go through the
   * identical component with identical validation.
   */
  async getForEdit(bankEntryId: string): Promise<{
    bankEntryId: string;
    versionId: string;
    version: number;
    status: QuestionStatus;
    input: QuestionInput;
  }> {
    const entry = await this.prisma.questionBankEntry.findUnique({
      where: { id: bankEntryId },
      select: {
        categoryId: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: { options: { orderBy: { position: 'asc' } } },
        },
      },
    });
    const version = entry?.versions[0];
    if (!entry || !version) throw new NotFoundException();

    const options = version.options.map((option) =>
      version.type === 'short_answer'
        ? {
            id: option.id,
            answerPattern: option.answerPattern ?? '',
            fraction: Number(option.fraction),
            feedbackHtml: option.feedbackHtml ?? undefined,
          }
        : {
            id: option.id,
            bodyHtml: option.bodyHtml,
            fraction: Number(option.fraction),
            feedbackHtml: option.feedbackHtml ?? undefined,
          },
    );

    const input = {
      type: version.type,
      categoryId: entry.categoryId,
      stemHtml: version.stemHtml,
      generalFeedbackHtml: version.generalFeedbackHtml ?? undefined,
      defaultMark: Number(version.defaultMark),
      settings: version.settings,
      options,
    } as unknown as QuestionInput;

    return {
      bankEntryId,
      versionId: version.id,
      version: version.version,
      status: version.status,
      input,
    };
  }

  /** Duplicate = a NEW bank entry carrying a fresh draft copy of the latest version. */
  async duplicate(bankEntryId: string, authorId: string): Promise<string> {
    const source = await this.prisma.questionVersion.findFirst({
      where: { bankEntryId, status: { in: ['ready', 'draft'] } },
      orderBy: [{ status: 'asc' }, { version: 'desc' }],
      include: { options: { orderBy: { position: 'asc' } }, bankEntry: true },
    });
    if (!source) throw new NotFoundException();

    const entry = await this.prisma.questionBankEntry.create({
      data: {
        categoryId: source.bankEntry.categoryId,
        ownerId: authorId,
        versions: {
          create: {
            version: 1,
            status: 'draft',
            type: source.type,
            stemHtml: source.stemHtml,
            generalFeedbackHtml: source.generalFeedbackHtml,
            defaultMark: source.defaultMark,
            settings: source.settings as object,
            createdBy: authorId,
            options: {
              // New rows, new ids. Sharing option rows would mean editing the
              // copy silently rewrites every attempt that used the original.
              create: source.options.map((option) => ({
                bodyHtml: option.bodyHtml,
                answerPattern: option.answerPattern,
                fraction: option.fraction,
                feedbackHtml: option.feedbackHtml,
                position: option.position,
              })),
            },
          },
        },
      },
    });
    return entry.id;
  }

  /**
   * v1 is one instructor, one subject, so every category is `global` (Task 1's
   * own comment) — there is no per-course or per-instructor scoping UI in this
   * plan. This is the minimal read/create surface the question form needs to
   * offer a real `categoryId`, not a category management screen.
   */
  async listCategories(): Promise<{ id: string; name: string }[]> {
    return this.prisma.questionCategory.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async createCategory(name: string): Promise<{ id: string; name: string }> {
    return this.prisma.questionCategory.create({
      data: { name, ownerScope: 'global' },
      select: { id: true, name: true },
    });
  }

  async list(filter: {
    categoryId?: string;
    type?: QuestionType;
    search?: string;
    take: number;
    skip: number;
  }) {
    return this.prisma.questionBankEntry.findMany({
      where: {
        categoryId: filter.categoryId,
        versions: {
          some: {
            type: filter.type,
            stemHtml: filter.search ? { contains: filter.search, mode: 'insensitive' } : undefined,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: filter.take,
      skip: filter.skip,
      select: {
        id: true,
        category: { select: { id: true, name: true } },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            status: true,
            type: true,
            stemHtml: true,
            defaultMark: true,
          },
        },
      },
    });
  }

  /**
   * All-or-nothing. A partial import leaves an instructor guessing which of
   * their 60 questions landed, so a single bad block rejects the whole paste
   * with the block numbers to fix.
   *
   * Each question is written `draft` (with its options) and THEN flipped to
   * `ready` by a second, options-free `UPDATE` — never in one nested write.
   * The Task 1 freeze trigger rejects an `INSERT` into `question_options`
   * whose parent version is already non-`draft`, so creating a version with
   * `status: 'ready'` and its options in the same nested Prisma write fails
   * against the real database (`question_version … is ready and its options
   * are immutable`) even though it type-checks. `publish()` above uses the
   * same two-step shape for exactly this reason.
   */
  async bulkImport(
    text: string,
    categoryId: string,
    authorId: string,
  ): Promise<{ created: number; errors: ImportError[] }> {
    const { questions, errors } = parseQuestionBlocks(text, categoryId);
    if (errors.length > 0) return { created: 0, errors };

    await this.prisma.$transaction(async (tx) => {
      for (const question of questions) {
        const entry = await tx.questionBankEntry.create({
          data: {
            categoryId,
            ownerId: authorId,
            versions: {
              create: {
                version: 1,
                status: 'draft',
                ...this.versionRow(question, authorId),
                options: { create: this.optionRows(question) },
              },
            },
          },
          include: { versions: true },
        });
        // Imported questions land as `ready`: the instructor already reviewed
        // them in the preview, and forcing 60 publish clicks would defeat the
        // entire point of a bulk import. This UPDATE touches only `status`,
        // which the freeze trigger always allows.
        await tx.questionVersion.update({
          where: { id: entry.versions[0]!.id },
          data: { status: 'ready' },
        });
      }
    });

    return { created: questions.length, errors: [] };
  }
}
