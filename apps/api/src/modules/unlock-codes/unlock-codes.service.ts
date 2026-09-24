import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminUnlockCodeCreateInput,
  AdminUnlockCodeItem,
  AdminUnlockCodeList,
  AdminUnlockCodeQuery,
  AdminUnlockCodeRow,
  AdminUnlockCourseOption,
  AdminUnlockCourseTree,
  UnlockCodeStatus,
} from '@ayman/contracts/admin/unlock-codes';
import type {
  MyUnlockCodes,
  RedeemUnlockCodeError,
  RedeemUnlockCodeResponse,
  UnlockOpenedItem,
} from '@ayman/contracts/unlock-codes';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { CONTENT_SCOPES } from '../entitlement/content-access';
import { courseAccessScopes, hasLiveCourseAccess } from '../entitlement/grant-liveness';
import { generateUnlockCode } from './unlock-code-generator';
import { UnlockAttemptsService } from './unlock-attempts.service';

/** Everything a row needs, selected once and shared by every reader. */
const CODE_SELECT = {
  id: true,
  code: true,
  wholeCourse: true,
  priceCents: true,
  note: true,
  createdAt: true,
  redeemedAt: true,
  revokedAt: true,
  course: { select: { id: true, slug: true, title: true } },
  createdBy: { select: { id: true, name: true } },
  redeemedBy: { select: { id: true, name: true, phoneNumber: true } },
  items: {
    orderBy: { id: 'asc' },
    select: {
      kind: true,
      termId: true,
      monthId: true,
      sectionId: true,
      lessonId: true,
      term: { select: { title: true } },
      month: { select: { title: true } },
      section: { select: { title: true } },
      lesson: { select: { title: true, section: { select: { title: true } } } },
    },
  },
} as const satisfies Prisma.UnlockCodeSelect;

type CodeRecord = Prisma.UnlockCodeGetPayload<{ select: typeof CODE_SELECT }>;

function statusOf(code: { redeemedAt: Date | null; revokedAt: Date | null }): UnlockCodeStatus {
  if (code.revokedAt !== null) return 'revoked';
  return code.redeemedAt !== null ? 'used' : 'unused';
}

function itemsOf(code: CodeRecord): AdminUnlockCodeItem[] {
  if (code.wholeCourse) {
    return [{ kind: 'course', id: code.course.id, title: code.course.title, parentTitle: null }];
  }
  return code.items.map((item) => {
    switch (item.kind) {
      case 'term':
        return { kind: 'term', id: item.termId!, title: item.term?.title ?? '', parentTitle: null };
      case 'month':
        return { kind: 'month', id: item.monthId!, title: item.month?.title ?? '', parentTitle: null };
      case 'section':
        return { kind: 'section', id: item.sectionId!, title: item.section?.title ?? '', parentTitle: null };
      case 'lesson':
        return {
          kind: 'lesson',
          id: item.lessonId!,
          title: item.lesson?.title ?? '',
          parentTitle: item.lesson?.section.title ?? null,
        };
    }
  });
}

function toRow(code: CodeRecord): AdminUnlockCodeRow {
  return {
    id: code.id,
    code: code.code,
    course: code.course,
    wholeCourse: code.wholeCourse,
    items: itemsOf(code),
    priceCents: code.priceCents,
    note: code.note,
    status: statusOf(code),
    createdAt: code.createdAt.toISOString(),
    createdBy: code.createdBy,
    redeemedAt: code.redeemedAt?.toISOString() ?? null,
    redeemedBy: code.redeemedBy
      ? { id: code.redeemedBy.id, name: code.redeemedBy.name, phone: code.redeemedBy.phoneNumber }
      : null,
    revokedAt: code.revokedAt?.toISOString() ?? null,
  };
}

/** A course's published lectures, in outline order, with what a code item can
 *  name them by. One query per course; `describe` does the rest in memory. */
interface OutlineLesson {
  id: string;
  sectionId: string;
  termId: string | null;
  monthIds: string[];
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/** A refusal the student reads. `code` is what the web switches on. */
function refusal(reason: RedeemUnlockCodeError, status: HttpStatus, details?: Record<string, number>) {
  return new HttpException(
    { code: `unlock_${reason}`, message: reason, ...(details ? { details } : {}) },
    status,
  );
}

/**
 * «أكواد الفتح».
 *
 * Generating writes a code and the list of what it opens — nothing else. No
 * grant exists until a student redeems it, so an unused code can be cancelled
 * or deleted without touching anybody's access.
 *
 * Redeeming turns each item into an ordinary `AccessGrant` (`source:
 * access_code`, `unlockCodeId` set) and makes sure the student has an
 * enrollment. From that moment the lesson gate, the quiz and the homework read
 * those grants the way they read every other grant — see `content-access.ts`
 * for the one new rule («code-only students get only what a code named»).
 *
 * Pulling a used code stamps `revokedAt` on exactly the grants it created, so
 * a student who ALSO paid for the month keeps the month.
 */
@Injectable()
export class UnlockCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attempts: UnlockAttemptsService,
  ) {}

  /* ── admin: the picker ──────────────────────────────────────────────── */

  async courseOptions(): Promise<{ items: AdminUnlockCourseOption[] }> {
    const courses = await this.prisma.course.findMany({
      where: { status: { in: ['published', 'draft'] } },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, title: true, slug: true, status: true },
    });
    return {
      items: courses.map((course) => ({
        id: course.id,
        title: course.title,
        slug: course.slug,
        published: course.status === 'published',
      })),
    };
  }

  async courseTree(courseId: string): Promise<AdminUnlockCourseTree> {
    const course = await this.prisma.course
      .findUnique({
        where: { id: courseId },
        select: {
          id: true,
          slug: true,
          title: true,
          terms: { orderBy: { position: 'asc' }, select: { id: true, title: true } },
          months: {
            orderBy: { monthIndex: 'asc' },
            select: { id: true, title: true, _count: { select: { lessons: true } } },
          },
          sections: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              isPublished: true,
              termId: true,
              lessons: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  title: true,
                  kind: true,
                  isPublished: true,
                  quiz: { select: { id: true } },
                  homework: { select: { lessonId: true } },
                },
              },
            },
          },
        },
      })
      .catch(() => null);
    if (!course) throw new NotFoundException('course not found');

    return {
      course: { id: course.id, slug: course.slug, title: course.title },
      terms: course.terms,
      months: course.months.map((month) => ({
        id: month.id,
        title: month.title,
        lessonCount: month._count.lessons,
      })),
      sections: course.sections.map((section) => ({
        id: section.id,
        title: section.title,
        published: section.isPublished,
        termId: section.termId,
        lessons: section.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          kind: lesson.kind,
          published: lesson.isPublished,
          hasQuiz: lesson.quiz !== null,
          hasHomework: lesson.homework !== null,
        })),
      })),
    };
  }

  /* ── admin: generate / list / pull / delete ─────────────────────────── */

  async create(adminId: string, input: AdminUnlockCodeCreateInput): Promise<{ codes: AdminUnlockCodeRow[] }> {
    const course = await this.prisma.course
      .findUnique({ where: { id: input.courseId }, select: { id: true } })
      .catch(() => null);
    if (!course) throw new NotFoundException('course not found');

    const items = input.wholeCourse ? [] : await this.validatedItems(input.courseId, input.items);

    /*
     * A collision on six characters is rare (a few hundred live codes in 887
     * million) but not impossible, and the UNIQUE index is what catches it —
     * not a pre-check, which would race another admin's press. On P2002 the
     * whole batch is retried with fresh codes; three strikes is a real fault.
     */
    let created: CodeRecord[] | null = null;
    for (let attempt = 0; attempt < 3 && created === null; attempt += 1) {
      try {
        created = await this.prisma.$transaction(async (tx) => {
          const codes = new Set<string>();
          while (codes.size < input.quantity) codes.add(generateUnlockCode());
          const rows: CodeRecord[] = [];
          for (const code of codes) {
            rows.push(
              await tx.unlockCode.create({
                data: {
                  code,
                  courseId: input.courseId,
                  wholeCourse: input.wholeCourse,
                  priceCents: input.priceCents,
                  note: input.note,
                  createdByUserId: adminId,
                  items: { create: items },
                },
                select: CODE_SELECT,
              }),
            );
          }
          return rows;
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    if (created === null) throw new ConflictException('could not allocate unique codes');

    await this.audit.record({
      action: 'unlock-code:create',
      resourceType: AUDIT_RESOURCES.unlockCode,
      resourceId: created[0]!.id,
      outcome: 'success',
      metadata: {
        adminId,
        courseId: input.courseId,
        codes: created.map((row) => row.code),
        wholeCourse: input.wholeCourse,
        items: items.length,
        priceCents: input.priceCents,
      },
    });

    return { codes: created.map(toRow) };
  }

  /**
   * Every item must name something IN this course. Checked here rather than
   * trusted from the picker, because the body is whatever the client sent and
   * a lecture id from another course would otherwise open another course.
   */
  private async validatedItems(
    courseId: string,
    requested: AdminUnlockCodeCreateInput['items'],
  ): Promise<Prisma.UnlockCodeItemCreateWithoutCodeInput[]> {
    const unique = new Map(requested.map((item) => [`${item.kind}:${item.id}`, item]));
    const idsOf = (kind: string) => [...unique.values()].filter((i) => i.kind === kind).map((i) => i.id);
    const [terms, months, sections, lessons] = await Promise.all([
      this.prisma.courseTerm.findMany({ where: { courseId, id: { in: idsOf('term') } }, select: { id: true } }),
      this.prisma.courseMonth.findMany({ where: { courseId, id: { in: idsOf('month') } }, select: { id: true } }),
      this.prisma.courseSection.findMany({ where: { courseId, id: { in: idsOf('section') } }, select: { id: true } }),
      this.prisma.lesson.findMany({ where: { courseId, id: { in: idsOf('lesson') } }, select: { id: true } }),
    ]);
    const found =
      terms.length + months.length + sections.length + lessons.length;
    if (found !== unique.size) {
      throw new BadRequestException({ code: 'unlock_item_outside_course', message: 'item not in course' });
    }
    return [
      ...terms.map((t) => ({ kind: 'term' as const, term: { connect: { id: t.id } } })),
      ...months.map((m) => ({ kind: 'month' as const, month: { connect: { id: m.id } } })),
      ...sections.map((s) => ({ kind: 'section' as const, section: { connect: { id: s.id } } })),
      ...lessons.map((l) => ({ kind: 'lesson' as const, lesson: { connect: { id: l.id } } })),
    ];
  }

  async list(query: AdminUnlockCodeQuery): Promise<AdminUnlockCodeList> {
    const scope: Prisma.UnlockCodeWhereInput = query.courseId ? { courseId: query.courseId } : {};
    const statusWhere: Record<AdminUnlockCodeQuery['status'], Prisma.UnlockCodeWhereInput> = {
      all: {},
      unused: { redeemedAt: null, revokedAt: null },
      used: { redeemedAt: { not: null }, revokedAt: null },
      revoked: { revokedAt: { not: null } },
    };
    const q = query.q.trim();
    const search: Prisma.UnlockCodeWhereInput = q
      ? {
          OR: [
            { code: { contains: q.replace(/[\s-]+/g, '').toUpperCase() } },
            { note: { contains: q, mode: 'insensitive' } },
            { course: { title: { contains: q, mode: 'insensitive' } } },
            { redeemedBy: { name: { contains: q, mode: 'insensitive' } } },
            { redeemedBy: { phoneNumber: { contains: q } } },
          ],
        }
      : {};
    const where: Prisma.UnlockCodeWhereInput = { AND: [scope, statusWhere[query.status], search] };

    const [rows, rowCount, unused, used, revoked] = await Promise.all([
      this.prisma.unlockCode.findMany({
        where,
        // Newest activity first: a code used a minute ago is what the admin
        // opens this screen to see, not the one he made last month.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: CODE_SELECT,
      }),
      this.prisma.unlockCode.count({ where }),
      this.prisma.unlockCode.count({ where: { AND: [scope, statusWhere.unused] } }),
      this.prisma.unlockCode.count({ where: { AND: [scope, statusWhere.used] } }),
      this.prisma.unlockCode.count({ where: { AND: [scope, statusWhere.revoked] } }),
    ]);

    return { rows: rows.map(toRow), rowCount, counts: { unused, used, revoked } };
  }

  /**
   * «إلغاء» on an unused code, «اسحب» on a used one — the same button.
   *
   * A used code's grants get `revokedAt`; nothing else the student holds is
   * touched. If those grants were the student's ONLY standing on the course
   * and the enrollment was minted by a code, the enrollment goes to `revoked`
   * too, so the course leaves their library instead of sitting there with
   * every lecture padlocked. Idempotent: pulling twice is one pull.
   */
  async revoke(adminId: string, id: string): Promise<AdminUnlockCodeRow> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const code = await tx.unlockCode
        .findUnique({ where: { id }, select: { id: true, courseId: true, redeemedByUserId: true, revokedAt: true } })
        .catch(() => null);
      if (!code) throw new NotFoundException('unlock code not found');
      if (code.revokedAt !== null) return { pulled: 0, enrollmentRevoked: false, already: true };

      await tx.unlockCode.update({ where: { id }, data: { revokedAt: now, revokedByUserId: adminId } });
      if (code.redeemedByUserId === null) return { pulled: 0, enrollmentRevoked: false, already: false };

      const { count: pulled } = await tx.accessGrant.updateMany({
        where: { unlockCodeId: id, revokedAt: null },
        data: { revokedAt: now, cancelReason: 'unlock code revoked' },
      });

      const enrollmentRevoked = await this.revokeCodeOnlyEnrollment(
        tx,
        code.redeemedByUserId,
        code.courseId,
        now,
      );
      return { pulled, enrollmentRevoked, already: false };
    });

    if (!result.already) {
      await this.audit.record({
        action: 'unlock-code:revoke',
        resourceType: AUDIT_RESOURCES.unlockCode,
        resourceId: id,
        outcome: 'success',
        metadata: { adminId, grantsRevoked: result.pulled, enrollmentRevoked: result.enrollmentRevoked },
      });
    }

    return toRow(await this.prisma.unlockCode.findUniqueOrThrow({ where: { id }, select: CODE_SELECT }));
  }

  private async revokeCodeOnlyEnrollment(
    tx: Prisma.TransactionClient,
    userId: string,
    courseId: string,
    now: Date,
  ): Promise<boolean> {
    const enrollment = await tx.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true, source: true, status: true },
    });
    if (!enrollment || enrollment.source !== 'code' || enrollment.status !== 'active') return false;

    const course = await tx.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { id: true, subjectId: true, requiresGrant: true },
    });
    const [wide, content] = await Promise.all([
      tx.accessGrant.findMany({
        where: { userId, OR: courseAccessScopes(course) },
        select: { scope: true, courseId: true, subjectId: true, validFrom: true, validUntil: true, revokedAt: true },
      }),
      tx.accessGrant.count({
        where: { userId, courseId, scope: { in: [...CONTENT_SCOPES] }, revokedAt: null },
      }),
    ]);
    if (content > 0 || hasLiveCourseAccess(wide, course, now)) return false;

    await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: 'revoked' } });
    return true;
  }

  /** Only a code nobody used. A used one is history — it is pulled, not erased. */
  async remove(adminId: string, id: string): Promise<{ ok: true }> {
    const code = await this.prisma.unlockCode
      .findUnique({ where: { id }, select: { code: true, redeemedAt: true } })
      .catch(() => null);
    if (!code) throw new NotFoundException('unlock code not found');
    if (code.redeemedAt !== null) {
      throw new ConflictException({ code: 'unlock_code_used', message: 'a used code is revoked, not deleted' });
    }
    await this.prisma.unlockCode.delete({ where: { id } });
    await this.audit.record({
      action: 'unlock-code:delete',
      resourceType: AUDIT_RESOURCES.unlockCode,
      resourceId: id,
      outcome: 'success',
      metadata: { adminId, code: code.code },
    });
    return { ok: true };
  }

  /* ── student ────────────────────────────────────────────────────────── */

  /**
   * «فعّل الكود».
   *
   * ⚠️ The lock is checked BEFORE the code, so a correct code typed during a
   * lock is refused too — otherwise the lock is only a counter and a script
   * learns it found one from the response.
   *
   * Single use is one conditional UPDATE inside the transaction: two students
   * racing the same code both pass the read, and Postgres gives the row to one
   * of them. The loser sees `used`.
   */
  async redeem(userId: string, ip: string, code: string): Promise<RedeemUnlockCodeResponse> {
    const lockedFor = await this.attempts.lockedFor(userId, ip);
    if (lockedFor > 0) {
      throw refusal('locked', HttpStatus.TOO_MANY_REQUESTS, { retryAfterSeconds: lockedFor });
    }

    const found = await this.prisma.unlockCode.findUnique({
      where: { code },
      select: {
        id: true,
        courseId: true,
        wholeCourse: true,
        redeemedAt: true,
        redeemedByUserId: true,
        revokedAt: true,
        createdByUserId: true,
        course: { select: { status: true } },
        items: { select: { kind: true, termId: true, monthId: true, sectionId: true, lessonId: true } },
      },
    });

    const miss = async (reason: RedeemUnlockCodeError, status: HttpStatus) => {
      const lock = await this.attempts.recordFailure(userId, ip);
      if (lock !== null) throw refusal('locked', HttpStatus.TOO_MANY_REQUESTS, { retryAfterSeconds: lock });
      throw refusal(reason, status);
    };

    if (!found) return miss('invalid', HttpStatus.NOT_FOUND);
    if (found.revokedAt !== null) return miss('revoked', HttpStatus.CONFLICT);
    if (found.redeemedAt !== null) {
      // The same student pressing twice (a retry, a second tab) is not a
      // stranger reusing their code: they get their success screen again.
      if (found.redeemedByUserId === userId) return this.describeRedeemed(found.id);
      return miss('used', HttpStatus.CONFLICT);
    }
    // Not the student's fault and not a guess: no strike, and the code is not
    // spent — it will work the moment the course is published.
    if (found.course.status !== 'published') {
      throw refusal('course_unavailable', HttpStatus.CONFLICT);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.unlockCode.updateMany({
        where: { id: found.id, redeemedAt: null, revokedAt: null },
        data: { redeemedAt: now, redeemedByUserId: userId },
      });
      if (count === 0) throw refusal('used', HttpStatus.CONFLICT);

      const base = {
        userId,
        courseId: found.courseId,
        source: 'access_code' as const,
        unlockCodeId: found.id,
        grantedByUserId: found.createdByUserId,
        validFrom: now,
        validUntil: null,
        note: `unlock code ${code}`,
      };
      const grants: Prisma.AccessGrantCreateManyInput[] = found.wholeCourse
        ? [{ ...base, scope: 'course' }]
        : found.items.map((item) => {
            switch (item.kind) {
              case 'term':
                return { ...base, scope: 'term', termId: item.termId };
              case 'month':
                return { ...base, scope: 'course_month', monthId: item.monthId };
              case 'section':
                return { ...base, scope: 'section', sectionId: item.sectionId };
              case 'lesson':
                return { ...base, scope: 'lesson', lessonId: item.lessonId };
            }
          });
      if (grants.length > 0) await tx.accessGrant.createMany({ data: grants });

      /*
       * The enrollment. Nothing reaches a lesson without an active one, so a
       * student meeting this course for the first time gets one, marked
       * `source: code` — which is what keeps it from opening the whole course
       * (see `ContentAccess`). An ACTIVE enrollment is left exactly as it is:
       * a month subscriber who bought a lecture from another month keeps their
       * subscription's standing. A lapsed one is revived AS a code enrollment,
       * because codes are now what this student holds here.
       */
      const enrollment = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: found.courseId } },
        select: { id: true, status: true },
      });
      if (!enrollment) {
        await tx.enrollment.create({ data: { userId, courseId: found.courseId, source: 'code' } });
      } else if (!(ACTIVE_ENROLLMENT_STATUSES as readonly string[]).includes(enrollment.status)) {
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { status: 'active', source: 'code' },
        });
      }
    });

    await this.audit.record({
      action: 'unlock-code:redeem',
      resourceType: AUDIT_RESOURCES.unlockCode,
      resourceId: found.id,
      outcome: 'success',
      metadata: { userId, courseId: found.courseId, code },
    });

    return this.describeRedeemed(found.id);
  }

  async listMine(userId: string): Promise<MyUnlockCodes> {
    const codes = await this.prisma.unlockCode.findMany({
      where: { redeemedByUserId: userId },
      orderBy: [{ redeemedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: CODE_SELECT,
    });
    const outlines = await this.outlines([...new Set(codes.map((c) => c.course.id))]);
    return {
      items: codes.map((code) => ({
        code: code.code,
        redeemedAt: code.redeemedAt!.toISOString(),
        course: code.course,
        opened: this.opened(code, outlines.get(code.course.id) ?? []),
        revoked: code.revokedAt !== null,
      })),
    };
  }

  private async describeRedeemed(id: string): Promise<RedeemUnlockCodeResponse> {
    const code = await this.prisma.unlockCode.findUniqueOrThrow({ where: { id }, select: CODE_SELECT });
    const outline = (await this.outlines([code.course.id])).get(code.course.id) ?? [];
    const opened = this.opened(code, outline);
    return {
      code: code.code,
      course: code.course,
      opened,
      startLessonId: opened.find((item) => item.lessonId !== null)?.lessonId ?? null,
    };
  }

  /** Published lectures per course, in the order the outline draws them. */
  private async outlines(courseIds: string[]): Promise<Map<string, OutlineLesson[]>> {
    const map = new Map<string, OutlineLesson[]>();
    if (courseIds.length === 0) return map;
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId: { in: courseIds }, isPublished: true, section: { isPublished: true } },
      orderBy: [{ section: { position: 'asc' } }, { position: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        courseId: true,
        sectionId: true,
        section: { select: { termId: true } },
        months: { select: { monthId: true } },
      },
    });
    for (const lesson of lessons) {
      const list = map.get(lesson.courseId) ?? [];
      list.push({
        id: lesson.id,
        sectionId: lesson.sectionId,
        termId: lesson.section.termId,
        monthIds: lesson.months.map((row) => row.monthId),
      });
      map.set(lesson.courseId, list);
    }
    return map;
  }

  private opened(code: CodeRecord, outline: OutlineLesson[]): UnlockOpenedItem[] {
    const summarise = (kind: UnlockOpenedItem['kind'], title: string, match: (l: OutlineLesson) => boolean) => {
      const lessons = outline.filter(match);
      return { kind, title, lessonCount: lessons.length, lessonId: lessons[0]?.id ?? null };
    };
    return itemsOf(code).map((item) => {
      switch (item.kind) {
        case 'course':
          return summarise('course', item.title, () => true);
        case 'term':
          return summarise('term', item.title, (l) => l.termId === item.id);
        case 'month':
          return summarise('month', item.title, (l) => l.monthIds.includes(item.id));
        case 'section':
          return summarise('section', item.title, (l) => l.sectionId === item.id);
        case 'lesson':
          return summarise('lesson', item.title, (l) => l.id === item.id);
      }
    });
  }
}
