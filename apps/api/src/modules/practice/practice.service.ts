import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminPracticeSetDetail,
  AdminPracticeSetRow,
  PracticePublicList,
  PracticePublicSet,
  PracticePublicSetSummary,
  PracticeQuestion,
  PracticeQuestionInput,
  PracticeSetCreate,
  PracticeSetPatch,
  PracticeTrack,
  PracticeYear,
} from '@ayman/contracts/practice';
import { AuditService } from '../../audit/audit.service';
import { isUniqueViolation } from '../../common/prisma/prisma-errors';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { isExactPermutation, sortPracticeSets } from './practice-order';

/**
 * «اختبارات مجانية» — public, no-account practice sets.
 *
 * ## The rule this file exists to enforce
 *
 * A draft is invisible, and so is an empty set. Both public reads filter
 * `published: true` AND "has a question" in the WHERE clause — never in
 * JavaScript after the fetch — and both shapes 404 identically to a lesson
 * that never had a set, so the difference cannot tell a stranger which
 * unpublished quizzes exist.
 *
 * ## Why the key ships with the question
 *
 * Unlike the bank (`question_bank_entries`), these are given away: the page
 * grades in the browser and writes nothing back. See the contract's header.
 *
 * ## Positions
 *
 * Dense 0..n-1 within a set, always. Every write that moves a position (append,
 * delete, reorder) runs in one transaction holding the set row `FOR UPDATE`,
 * so two admins appending at once cannot both read the same "next position".
 */

const SUMMARY_SELECT = {
  id: true,
  year: true,
  track: true,
  lessonCode: true,
  title: true,
  unitTitle: true,
  articleSlug: true,
  published: true,
  updatedAt: true,
  _count: { select: { questions: true } },
} as const;

const QUESTION_SELECT = {
  id: true,
  type: true,
  stem: true,
  options: true,
  answer: true,
  explanation: true,
  position: true,
} as const;

/* `id` after `position`: positions are dense by construction, but a tie would
   otherwise be resolved differently by every read. */
const QUESTION_ORDER = [{ position: 'asc' }, { id: 'asc' }] as const;

interface SummaryRow {
  id: string;
  year: number;
  track: PracticeTrack;
  lessonCode: string;
  title: string;
  unitTitle: string | null;
  articleSlug: string | null;
  published: boolean;
  updatedAt: Date;
  _count: { questions: number };
}

interface QuestionRow {
  id: string;
  type: 'mcq' | 'tf';
  stem: string;
  options: string[];
  answer: number;
  explanation: string;
  position: number;
}

function toSummary(row: SummaryRow): PracticePublicSetSummary {
  return {
    // The CHECK constraint holds `year` to 1|2; the cast only restates it.
    year: row.year as PracticeYear,
    track: row.track,
    lessonCode: row.lessonCode,
    title: row.title,
    unitTitle: row.unitTitle,
    articleSlug: row.articleSlug,
    questionCount: row._count.questions,
  };
}

function toAdminRow(row: SummaryRow): AdminPracticeSetRow {
  return { ...toSummary(row), id: row.id, published: row.published, updatedAt: row.updatedAt.toISOString() };
}

function toQuestion(row: QuestionRow): PracticeQuestion {
  return {
    id: row.id,
    type: row.type,
    stem: row.stem,
    // `TEXT[]` is nullable in SQL (Prisma's own DDL for a list); never in the contract.
    options: row.options ?? [],
    answer: row.answer,
    explanation: row.explanation,
    position: row.position,
  };
}

/**
 * The fields of one question as stored. `tf` options are forced empty here too:
 * the contract already refuses them, and this keeps a later schema loosening
 * from writing options a tf page would never show.
 */
function questionData(input: PracticeQuestionInput) {
  return {
    type: input.type,
    stem: input.stem,
    options: input.type === 'tf' ? [] : input.options,
    answer: input.answer,
    explanation: input.explanation,
  };
}

@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── public ─────────────────────────────────────────────────────────────

  async listPublic(): Promise<PracticePublicList> {
    const rows = await this.prisma.practiceSet.findMany({
      where: { published: true, questions: { some: {} } },
      select: SUMMARY_SELECT,
    });
    return { sets: sortPracticeSets(rows).map(toSummary) };
  }

  /**
   * One published, non-empty set, or `null` — the caller turns it into a 404.
   * A draft, an empty set and a lesson with no set must be indistinguishable.
   */
  async findPublic(year: PracticeYear, track: PracticeTrack, lessonCode: string): Promise<PracticePublicSet | null> {
    const row = await this.prisma.practiceSet.findFirst({
      where: { year, track, lessonCode, published: true, questions: { some: {} } },
      select: { ...SUMMARY_SELECT, questions: { select: QUESTION_SELECT, orderBy: [...QUESTION_ORDER] } },
    });
    if (!row) return null;
    return {
      ...toSummary(row),
      // `position` stays server-side: the array order IS the order.
      questions: row.questions.map((q) => {
        const { position: _position, ...rest } = toQuestion(q);
        return rest;
      }),
    };
  }

  // ── admin: sets ────────────────────────────────────────────────────────

  async listAdmin(): Promise<AdminPracticeSetRow[]> {
    const rows = await this.prisma.practiceSet.findMany({ select: SUMMARY_SELECT });
    return sortPracticeSets(rows).map(toAdminRow);
  }

  async findAdmin(id: string): Promise<AdminPracticeSetDetail> {
    const row = await this.prisma.practiceSet.findUnique({
      where: { id },
      select: { ...SUMMARY_SELECT, questions: { select: QUESTION_SELECT, orderBy: [...QUESTION_ORDER] } },
    });
    if (!row) throw new NotFoundException();
    return { ...toAdminRow(row), questions: row.questions.map(toQuestion) };
  }

  async create(input: PracticeSetCreate, actorId: string): Promise<AdminPracticeSetDetail> {
    let id: string;
    try {
      const row = await this.prisma.practiceSet.create({
        data: {
          year: input.year,
          track: input.track,
          lessonCode: input.lessonCode,
          title: input.title,
          unitTitle: input.unitTitle,
          articleSlug: input.articleSlug,
          published: input.published,
        },
        select: { id: true },
      });
      id = row.id;
    } catch (error) {
      // The unique index is the guarantee; this turns it into a usable answer.
      if (isUniqueViolation(error)) throw new ConflictException('practice_set_exists');
      throw error;
    }

    await this.audit.record({
      actorUserId: actorId,
      action: 'practice:create',
      resourceType: AUDIT_RESOURCES.practiceSet,
      resourceId: id,
      outcome: 'success',
      metadata: { year: input.year, track: input.track, lessonCode: input.lessonCode, published: input.published },
    });

    return this.findAdmin(id);
  }

  /** Only the fields present are written — see the contract's `.partial()` warning. */
  async patch(id: string, input: PracticeSetPatch, actorId: string): Promise<AdminPracticeSetDetail> {
    const existing = await this.prisma.practiceSet.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException();

    const data: Prisma.PracticeSetUpdateInput = {};
    if (input.year !== undefined) data.year = input.year;
    if (input.track !== undefined) data.track = input.track;
    if (input.lessonCode !== undefined) data.lessonCode = input.lessonCode;
    if (input.title !== undefined) data.title = input.title;
    if (input.unitTitle !== undefined) data.unitTitle = input.unitTitle;
    if (input.articleSlug !== undefined) data.articleSlug = input.articleSlug;
    if (input.published !== undefined) data.published = input.published;

    try {
      await this.prisma.practiceSet.update({ where: { id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('practice_set_exists');
      throw error;
    }

    await this.audit.record({
      actorUserId: actorId,
      action: 'practice:update',
      resourceType: AUDIT_RESOURCES.practiceSet,
      resourceId: id,
      outcome: 'success',
      metadata: { fields: Object.keys(data), ...(input.published === undefined ? {} : { published: input.published }) },
    });

    return this.findAdmin(id);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.practiceSet.findUnique({
      where: { id },
      select: { year: true, track: true, lessonCode: true, title: true, _count: { select: { questions: true } } },
    });
    if (!existing) throw new NotFoundException();

    // Questions go with it (`ON DELETE CASCADE`).
    await this.prisma.practiceSet.delete({ where: { id } });

    await this.audit.record({
      actorUserId: actorId,
      action: 'practice:delete',
      resourceType: AUDIT_RESOURCES.practiceSet,
      resourceId: id,
      outcome: 'success',
      // The row is gone; this line is the only trace of what it was.
      metadata: {
        year: existing.year,
        track: existing.track,
        lessonCode: existing.lessonCode,
        title: existing.title,
        questionCount: existing._count.questions,
      },
    });
  }

  // ── admin: questions ───────────────────────────────────────────────────

  /** Appends in the order given, after the set's current last question. */
  async addQuestions(setId: string, questions: PracticeQuestionInput[], actorId: string): Promise<AdminPracticeSetDetail> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockSet(tx, setId);
      const count = await tx.practiceQuestion.count({ where: { setId } });
      await tx.practiceQuestion.createMany({
        data: questions.map((q, index) => ({ ...questionData(q), setId, position: count + index })),
      });
      await this.audit.recordTx(tx, {
        actorUserId: actorId,
        action: 'practice:questions',
        resourceType: AUDIT_RESOURCES.practiceSet,
        resourceId: setId,
        outcome: 'success',
        metadata: { operation: 'add', count: questions.length },
      });
    });
    return this.findAdmin(setId);
  }

  async patchQuestion(id: string, input: PracticeQuestionInput, actorId: string): Promise<AdminPracticeSetDetail> {
    const existing = await this.prisma.practiceQuestion.findUnique({ where: { id }, select: { setId: true } });
    if (!existing) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await tx.practiceQuestion.update({ where: { id }, data: questionData(input) });
      await this.audit.recordTx(tx, {
        actorUserId: actorId,
        action: 'practice:questions',
        resourceType: AUDIT_RESOURCES.practiceSet,
        resourceId: existing.setId,
        outcome: 'success',
        metadata: { operation: 'edit', questionId: id },
      });
    });
    return this.findAdmin(existing.setId);
  }

  async removeQuestion(id: string, actorId: string): Promise<AdminPracticeSetDetail> {
    const existing = await this.prisma.practiceQuestion.findUnique({
      where: { id },
      select: { setId: true, stem: true },
    });
    if (!existing) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await this.lockSet(tx, existing.setId);
      await tx.practiceQuestion.delete({ where: { id } });
      const rest = await tx.practiceQuestion.findMany({
        where: { setId: existing.setId },
        select: { id: true, position: true },
        orderBy: [...QUESTION_ORDER],
      });
      await this.renumber(tx, rest, rest.map((row) => row.id));
      await this.audit.recordTx(tx, {
        actorUserId: actorId,
        action: 'practice:questions',
        resourceType: AUDIT_RESOURCES.practiceSet,
        resourceId: existing.setId,
        outcome: 'success',
        metadata: { operation: 'delete', questionId: id, stem: existing.stem.slice(0, 200) },
      });
    });
    return this.findAdmin(existing.setId);
  }

  /** 400 unless `ids` is exactly the set's questions, each once. */
  async reorder(setId: string, ids: string[], actorId: string): Promise<AdminPracticeSetDetail> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockSet(tx, setId);
      const current = await tx.practiceQuestion.findMany({
        where: { setId },
        select: { id: true, position: true },
      });
      if (!isExactPermutation(current.map((row) => row.id), ids)) {
        throw new BadRequestException('practice_order_mismatch');
      }
      await this.renumber(tx, current, ids);
      await this.audit.recordTx(tx, {
        actorUserId: actorId,
        action: 'practice:questions',
        resourceType: AUDIT_RESOURCES.practiceSet,
        resourceId: setId,
        outcome: 'success',
        metadata: { operation: 'reorder', count: ids.length },
      });
    });
    return this.findAdmin(setId);
  }

  // ── internals ──────────────────────────────────────────────────────────

  /** 404 for a set that does not exist; otherwise holds its row until commit. */
  private async lockSet(tx: Prisma.TransactionClient, setId: string): Promise<void> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM app.practice_sets WHERE id = ${setId}::uuid FOR UPDATE
    `;
    if (locked.length === 0) throw new NotFoundException();
  }

  /** Writes `order[i]` to position i, touching only the rows that moved. */
  private async renumber(
    tx: Prisma.TransactionClient,
    rows: readonly { id: string; position: number }[],
    order: readonly string[],
  ): Promise<void> {
    const before = new Map(rows.map((row) => [row.id, row.position]));
    for (const [position, id] of order.entries()) {
      if (before.get(id) === position) continue;
      await tx.practiceQuestion.update({ where: { id }, data: { position } });
    }
  }
}
