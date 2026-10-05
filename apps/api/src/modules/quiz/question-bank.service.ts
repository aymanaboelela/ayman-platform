import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { QuestionInputSchema, type QuestionInput } from '@ayman/contracts/quiz/question';
import { parseQuestionBlocks, type ImportError } from '@ayman/contracts/quiz/import';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import type { QuestionStatus, QuestionType } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';

export interface QuestionVersionSummary {
  bankEntryId: string;
  versionId: string;
  version: number;
  status: QuestionStatus;
  type: QuestionType;
}

/**
 * B8. Both authoring paths (the admin form's `redistribute()` and the bulk
 * import parser) compute an even split as `1 / n` at full double precision —
 * exact in IEEE-754 (`1/3 + 1/3 + 1/3 === 1`), so draft-time validation
 * always passes. The `question_options.fraction` column is `numeric(10,6)`,
 * which rounds EACH weight independently on the way in
 * (`0.3333333333333333::numeric(10,6)` → `0.333333`), so three of them sum to
 * `0.999999`, not `1`. That single stored value then fails `publish()`'s
 * re-validation (the same schema re-run against the stored rows) — a 3/6/9/
 * 12/13-way even split could never be published through the admin UI at
 * all — and, if it reaches `ready` anyway via `bulkImport` (which flips
 * status directly, bypassing `publish()`), a student who ticks every correct
 * option is graded "partial" instead of "right".
 *
 * The fix is to quantize at WRITE time, not read time: round every
 * POSITIVE-credit weight (the same `fraction > 0` predicate the admin's own
 * option picker and `describeRightAnswer` already use to mean "this option is
 * correct") to 6 decimal places, then hand the entire rounding remainder to
 * the LARGEST one — so the stored values sum to exactly `1.000000` for every
 * n, not just the ones that happen to round up. Negative-fraction options
 * (per-option negative marking) are untouched; they carry no such
 * sum-to-one invariant.
 */
export function quantizeOptionWeights<T extends { fraction: number }>(options: readonly T[]): T[] {
  const positive = options.filter((option) => option.fraction > 0);
  if (positive.length === 0) return [...options];

  const rounded = new Map<T, number>(
    positive.map((option) => [option, Math.round(option.fraction * 1e6) / 1e6]),
  );
  const sum = [...rounded.values()].reduce((total, weight) => total + weight, 0);
  const remainder = Math.round((1 - sum) * 1e6) / 1e6;

  if (remainder !== 0) {
    let largest = positive[0]!;
    for (const option of positive) {
      if (rounded.get(option)! > rounded.get(largest)!) largest = option;
    }
    rounded.set(largest, Math.round((rounded.get(largest)! + remainder) * 1e6) / 1e6);
  }

  return options.map((option) =>
    rounded.has(option) ? { ...option, fraction: rounded.get(option)! } : option,
  );
}

@Injectable()
export class QuestionBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Rows are built field by field from the PARSED input. There is no
   * `data: dto` spread anywhere in this file — `version`, `status`,
   * `createdBy` and every option id are server-decided, so a payload carrying
   * `{ version: 99, status: 'ready' }` changes nothing.
   */
  private optionRows(input: QuestionInput) {
    if (input.type === 'essay') return [];
    // B8: quantized ONCE here, per branch (after the type narrows `options`
    // to the branch's own shape) — the single funnel every write path
    // (`create`, `saveDraft`, `bulkImport`) already goes through — so the
    // stored weights sum to exactly 1.000000 regardless of how the caller
    // computed them.
    if (input.type === 'short_answer') {
      return quantizeOptionWeights(input.options).map((option, index) => ({
        // A short-answer pattern must NOT be sanitized: HTML-encoding `<`
        // would silently break `a < b`. The review screen renders it as text.
        bodyHtml: '',
        answerPattern: option.answerPattern,
        fraction: option.fraction,
        feedbackHtml: option.feedbackHtml ? sanitizeRichText(option.feedbackHtml) : null,
        position: index,
      }));
    }
    return quantizeOptionWeights(input.options).map((option, index) => ({
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
   *
   * `true` when THIS call made it ready; `false` when it already was not a
   * draft — the single button ignores it, `publishDrafts` counts with it.
   */
  async publish(versionId: string): Promise<boolean> {
    const version = await this.prisma.questionVersion.findUnique({
      where: { id: versionId },
      include: { options: { orderBy: { position: 'asc' } }, bankEntry: true },
    });
    if (!version) throw new NotFoundException();
    if (version.status !== 'draft') return false;

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

    await this.audit.record({
      action: 'question:publish',
      resourceType: AUDIT_RESOURCES.questionVersion,
      resourceId: versionId,
      outcome: 'success',
      metadata: { bankEntryId: version.bankEntryId, version: version.version },
    });
    return true;
  }

  /**
   * «انشر المسودات» — `publish()` above, once per draft in scope, and nothing
   * of its own on the question rows.
   *
   * Deliberately a loop over the single path rather than one
   * `updateMany({ status: 'ready' })`: that UPDATE would be faster and would
   * skip the re-validation of the stored rows — which is the whole reason
   * `publish()` exists, and exactly what a few thousand generated variants
   * need — and the per-version `question:publish` audit row. A question that
   * fails comes back in `failed` and stays a draft; the others go regardless,
   * because one bad block out of four hundred should not hold the rest back
   * the way it does in a paste (there the fix is to edit the paste; here it is
   * to open that one question).
   *
   * Sequential, not `Promise.all`: every publish writes an audit row, and the
   * audit chain serialises on an advisory lock anyway — concurrency here only
   * buys pooled connections waiting on each other.
   *
   * Scope is the latest version's draft: `saveDraft` never leaves a draft
   * under a newer version, so «the entry's draft» and «its latest, if draft»
   * are the same row. Archived questions are out — they left the bank, and a
   * category sweep must not quietly publish what «امسح» put away.
   */
  async publishDrafts(scope: {
    categoryId?: string | undefined;
    versionIds?: readonly string[] | undefined;
  }): Promise<{ published: number; failed: { versionId: string; bankEntryId: string; message: string }[] }> {
    // Belt and braces for the refine on the DTO: an empty scope is never "the
    // whole bank".
    if (!scope.categoryId && !scope.versionIds?.length) return { published: 0, failed: [] };

    const drafts = await this.prisma.questionVersion.findMany({
      where: {
        status: 'draft',
        ...(scope.versionIds ? { id: { in: [...scope.versionIds] } } : {}),
        bankEntry: { archivedAt: null, ...(scope.categoryId ? { categoryId: scope.categoryId } : {}) },
      },
      // Oldest first, so a bulk publish walks a paste in the order it was written.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, bankEntryId: true },
    });
    let published = 0;
    const failed: { versionId: string; bankEntryId: string; message: string }[] = [];
    for (const draft of drafts) {
      try {
        if (await this.publish(draft.id)) published += 1;
      } catch (error) {
        failed.push({ versionId: draft.id, bankEntryId: draft.bankEntryId, message: publishFailure(error) });
      }
    }

    // Nothing in scope wrote nothing, and is not worth a row saying so.
    if (drafts.length > 0) await this.audit.record({
      action: 'question:publish-drafts',
      resourceType: scope.categoryId ? AUDIT_RESOURCES.questionCategory : AUDIT_RESOURCES.questionVersion,
      resourceId: scope.categoryId ?? null,
      outcome: failed.length === 0 ? 'success' : 'failure',
      metadata: {
        scope: scope.categoryId ? 'category' : 'versions',
        requested: scope.versionIds?.length ?? drafts.length,
        published,
        failed: failed.map((item) => item.versionId),
      },
    });

    return { published, failed };
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
    /** Set when the question was deleted after somebody had answered it — the
     *  page says so and offers «رجّعه للبنك». ISO string over the wire. */
    archivedAt: Date | null;
    /**
     * How many DISTINCT quizzes hold a slot pointing at this entry.
     *
     * A bank question is shared, so editing it from inside one exam edits it
     * in all of them. The builder's inline editor says so above the form when
     * this is greater than one — before the instructor types, which is the
     * only time saying it helps.
     */
    usedInQuizzes: number;
    input: QuestionInput;
  }> {
    const entry = await this.prisma.questionBankEntry.findUnique({
      where: { id: bankEntryId },
      select: {
        categoryId: true,
        archivedAt: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: { options: { orderBy: { position: 'asc' } } },
        },
      },
    });
    const version = entry?.versions[0];
    if (!entry || !version) throw new NotFoundException();

    // DISTINCT on the quiz, not a slot count: one exam may legitimately use
    // the same question on both its papers, and calling that "two exams"
    // would raise an alarm about a question that is only in one.
    const quizzes = await this.prisma.quizSlot.findMany({
      where: { bankEntryId },
      select: { quizId: true },
      distinct: ['quizId'],
    });

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
      archivedAt: entry.archivedAt,
      usedInQuizzes: quizzes.length,
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
  async listCategories(): Promise<{ id: string; name: string; questionCount: number; draftCount: number }[]> {
    /*
     * `questionCount` — questions still IN the bank (an archived one is not
     * counted), for «التصنيفات» on the bank screen: «الحلقات · ٤٥» is how the
     * teacher sees where the bank is thin before a paper needs it. One
     * `GROUP BY` over the whole bank, not a `_count` per category row — the
     * same number, one query. Every other caller parses `{ id, name }` and a
     * Zod object ignores the extra key.
     */
    const [categories, counts, drafts] = await Promise.all([
      this.prisma.questionCategory.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.questionBankEntry.groupBy({
        by: ['categoryId'],
        // The same rows the list counts: in the bank, with at least one
        // version. An entry with no version at all never shows in the list,
        // so counting it here made «٧٤٣ في البنك» sit over «٧٢٨ سؤال».
        where: { archivedAt: null, versions: { some: {} } },
        _count: { _all: true },
      }),
      // `draftCount` — what «انشر كل مسودات التصنيف ده» would publish: the
      // same predicate as `list({ status: 'draft' })` and `publishDrafts`, so
      // the number on the button is the number that goes.
      this.prisma.questionBankEntry.groupBy({
        by: ['categoryId'],
        where: { archivedAt: null, versions: { some: { status: 'draft' } } },
        _count: { _all: true },
      }),
    ]);
    const byCategory = new Map(counts.map((row) => [row.categoryId, row._count._all]));
    const draftsBy = new Map(drafts.map((row) => [row.categoryId, row._count._all]));
    return categories.map((category) => ({
      ...category,
      questionCount: byCategory.get(category.id) ?? 0,
      draftCount: draftsBy.get(category.id) ?? 0,
    }));
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
    /** `true` = «اللي اتشالت» only; otherwise the bank, which never includes them. */
    archived?: boolean;
    /**
     * «مسودات» / «جاهزة». A draft is only ever the LATEST version (`saveDraft`
     * edits a draft in place and only opens N+1 over a ready one), so «has a
     * draft» is «waiting on a press» — including a published question with an
     * unpublished edit — and «no draft» is «what students get is what is
     * here». Omitted = both.
     */
    status?: 'draft' | 'ready' | undefined;
    /** `group`: variants of one idea side by side, for reading wordings
     *  against each other. Otherwise the newest first, as always. */
    sort?: 'recent' | 'group' | undefined;
    take: number;
    skip: number;
  }) {
    /*
     * `rowCount` alongside the rows, because the screen could not paginate
     * without it — and it was not paginating.
     *
     * The page sent no `take`/`skip` at all, so the controller's default of 50
     * applied to a bank of 704: 654 questions, 93% of everything he has
     * written, were unreachable from the admin UI with no pager and nothing on
     * screen saying there was more. A bare array cannot tell a pager how many
     * pages exist, which is why the shape changes here.
     */
    const where = {
      categoryId: filter.categoryId,
      // An archived question left the bank: it is not in the list, and so not
      // in the slot picker that reads this same route. «اللي اتشالت» asks for
      // them on purpose, and gets nothing else.
      archivedAt: filter.archived ? { not: null } : null,
      versions: {
        some: {
          type: filter.type,
          stemHtml: filter.search ? { contains: filter.search, mode: 'insensitive' } : undefined,
        },
      },
      AND:
        filter.status === 'draft'
          ? [{ versions: { some: { status: 'draft' } } }]
          : filter.status === 'ready'
            ? [{ versions: { none: { status: 'draft' } } }, { versions: { some: { status: 'ready' } } }]
            : [],
    } satisfies Prisma.QuestionBankEntryWhereInput;

    const [rowCount, rows] = await this.prisma.$transaction([
      this.prisma.questionBankEntry.count({ where }),
      this.prisma.questionBankEntry.findMany({
      where,
      /* `id` after the timestamp. A bulk import writes a whole batch inside one
         transaction, so identical `updatedAt` values are the NORMAL case here,
         not an edge — and with `skip`/`take` live an unstable order shows some
         questions twice and hides others. */
      orderBy:
        filter.sort === 'group'
          ? // Ungrouped questions after every group, not between them.
            [{ variantGroupKey: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }]
          : [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: filter.take,
      skip: filter.skip,
      select: {
        id: true,
        archivedAt: true,
        // «صيغ مختلفة لنفس الفكرة» — shown on the row so a variant is reviewed
        // beside its siblings, not alone.
        variantGroupKey: true,
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
            // The explanation the games show after a wrong answer — reviewed
            // with the wording it explains, before a draft goes out.
            generalFeedbackHtml: true,
            defaultMark: true,
            /* The options, with their weights, so the list can show each
               question the way the student gets it — letters, and the right
               one marked. Admin-only route (`question:write`); the weights are
               exactly what the edit form already loads. */
            options: {
              orderBy: { position: 'asc' },
              select: { id: true, bodyHtml: true, answerPattern: true, fraction: true },
            },
          },
        },
        // Which quizzes hold it — the row says «في ٣ امتحان», which is what a
        // delete will run into, before anyone presses it.
        quizSlots: { select: { quizId: true } },
      },
      }),
    ]);

    return {
      rows: rows.map(({ quizSlots, versions, ...row }) => ({
        ...row,
        usedInQuizzes: new Set(quizSlots.map((slot) => slot.quizId)).size,
        versions: versions.map((version) => ({
          ...version,
          options: version.options.map((option) => ({ ...option, fraction: Number(option.fraction) })),
        })),
      })),
      rowCount,
    };
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
    options: { lessonId?: string | undefined; status?: 'ready' | 'draft' | undefined } = {},
  ): Promise<{ created: number; errors: ImportError[] }> {
    const { questions, meta, errors } = parseQuestionBlocks(text, categoryId);
    if (errors.length > 0) return { created: 0, errors };

    // «التحديات»: every lesson a block (or the paste as a whole) points at has
    // to exist — a stale id from another stack would otherwise be a FK error
    // halfway through the transaction, with no block number to fix.
    const wanted = [...new Set([options.lessonId, ...meta.map((entry) => entry.lessonId)].filter((id): id is string => !!id))];
    if (wanted.length > 0) {
      const known = new Set(
        (await this.prisma.lesson.findMany({ where: { id: { in: wanted } }, select: { id: true } })).map((lesson) => lesson.id),
      );
      if (options.lessonId && !known.has(options.lessonId)) throw new NotFoundException();
      const missing: ImportError[] = meta.flatMap((entry, index) =>
        entry.lessonId && !known.has(entry.lessonId)
          ? [
              {
                blockIndex: index + 1,
                line: 1,
                message: formatCopy(copy.quizErrors.importUnknownLesson, { n: index + 1, lesson: entry.lessonId }),
              },
            ]
          : [],
      );
      if (missing.length > 0) return { created: 0, errors: missing };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, question] of questions.entries()) {
        const entry = await tx.questionBankEntry.create({
          data: {
            categoryId,
            ownerId: authorId,
            lessonId: meta[index]?.lessonId ?? options.lessonId ?? null,
            variantGroupKey: meta[index]?.variantGroupKey ?? null,
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
        // A draft paste stops here: the owner publishes from the bank after
        // reading them — one at a time, the ticked ones, or the whole category
        // (`publishDrafts`) — and nothing student-facing reads a draft version.
        if (options.status === 'draft') continue;
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

/**
 * The line a failed draft shows in the bulk result: the first thing the form
 * itself would have said about it («لازم تحدد إجابة صحيحة واحدة بالظبط»), not
 * the generic headline `publish()` puts above the issue list.
 */
function publishFailure(error: unknown): string {
  if (error instanceof BadRequestException) {
    const body = error.getResponse() as { message?: unknown; issues?: { message?: unknown }[] };
    const first = body.issues?.[0]?.message;
    if (typeof first === 'string' && first) return first;
    if (typeof body.message === 'string' && body.message) return body.message;
  }
  if (error instanceof NotFoundException) return copy.quizErrors.publishDraftGone;
  return copy.quizErrors.publishDraftFailed;
}
