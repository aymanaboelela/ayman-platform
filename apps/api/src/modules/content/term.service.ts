import { Injectable, NotFoundException } from '@nestjs/common';
import type { CourseTerm, TermCreateInput, TermSetOpenResult, TermUpdateInput } from '@ayman/contracts/content';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * الترم الأول / الترم الثاني — CRUD on `CourseTerm`, and the one action that
 * is materially more than a field edit: closing a term.
 *
 * See the `CourseTerm` model doc in schema.prisma for the full reasoning
 * behind the shape. Short version relevant to this file: `isOpen` is not
 * read by anything that decides access (`EntitlementService`,
 * `LessonAccessService`) — the actual enforcement of a closed term is
 * `setOpen` below bulk-revoking every live `scope: term` `AccessGrant` for
 * it, the same mechanism a lapsed course subscription already uses.
 */
@Injectable()
export class TermService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(courseId: string): Promise<CourseTerm[]> {
    return this.prisma.courseTerm.findMany({
      where: { courseId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  /** Appends. Positions are contiguous from 0, same convention as sections —
   *  there is no reorder endpoint for terms in v1 (see the contract's own
   *  note on why). */
  async create(courseId: string, input: TermCreateInput): Promise<CourseTerm> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new NotFoundException();

    const last = await this.prisma.courseTerm.findFirst({
      where: { courseId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    const term = await this.prisma.courseTerm.create({
      data: {
        courseId,
        title: input.title,
        priceCents: input.priceCents,
        position: last === null ? 0 : last.position + 1,
      },
    });

    // Same "one action, `operation` in metadata" convention as
    // `SectionService.create`/`.update` — `AUDIT_ACTIONS` carries `term:update`
    // for every plain field edit, `term:close` only for the bulk-revoke below.
    await this.audit.record({
      action: 'term:update',
      resourceType: AUDIT_RESOURCES.courseTerm,
      resourceId: term.id,
      outcome: 'success',
      metadata: { operation: 'create', courseId, title: term.title },
    });

    return term;
  }

  /** Title/price only — see `TermUpdateSchema`'s own note on why `isOpen`
   *  is deliberately not accepted here. */
  async update(id: string, input: TermUpdateInput): Promise<CourseTerm> {
    const term = await this.prisma.courseTerm.findUnique({ where: { id }, select: { id: true } });
    if (!term) throw new NotFoundException();

    const updated = await this.prisma.courseTerm.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
      },
    });

    await this.audit.record({
      action: 'term:update',
      resourceType: AUDIT_RESOURCES.courseTerm,
      resourceId: id,
      outcome: 'success',
      metadata: { operation: 'update', changed: Object.keys(input) },
    });

    return updated;
  }

  /**
   * The open/close switch.
   *
   * Closing (`isOpen: true → false`) bulk-revokes every LIVE `scope: term`
   * grant for THIS term, in the SAME transaction as the flag flip — so a
   * term can never end up closed with a still-live grant behind it, even if
   * the process dies between the two writes. `LessonAccessService.require`'s
   * existing lapsed-grant re-check (added for subscription expiry) is what
   * turns that `revokedAt` into an actual, immediate refusal the very next
   * time any of those students opens a lesson in this term — nothing here
   * needs to reach into their sessions or evict them proactively.
   *
   * Reopening (`false → true`) touches no grants at all — see the model doc's
   * note on why a previously-revoked grant stays revoked rather than being
   * restored.
   *
   * Returns the real count of grants just cut off, not a bare 200 — the PR
   * this shipped in was explicitly required to prove the cascade actually
   * happened, and a number the admin UI can show ("قفلت الترم، وسحبنا
   * الوصول من ٣ طلبة") is the same proof surfaced to the person who pressed
   * the switch.
   */
  async setOpen(id: string, isOpen: boolean): Promise<TermSetOpenResult> {
    const term = await this.prisma.courseTerm.findUnique({ where: { id } });
    if (!term) throw new NotFoundException();

    if (term.isOpen === isOpen) {
      // Idempotent no-op — still a legitimate call (a double-click, a retried
      // request), just nothing left to revoke or to write an audit row about.
      return { term, revokedGrantCount: 0 };
    }

    const [updatedTerm, revokedGrantCount] = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.courseTerm.update({ where: { id }, data: { isOpen } });

      if (isOpen) {
        return [updated, 0] as const;
      }

      const result = await tx.accessGrant.updateMany({
        where: { scope: 'term', termId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return [updated, result.count] as const;
    });

    await this.audit.record({
      action: isOpen ? 'term:update' : 'term:close',
      resourceType: AUDIT_RESOURCES.courseTerm,
      resourceId: id,
      outcome: 'success',
      metadata: isOpen
        ? { operation: 'reopen', courseId: term.courseId }
        : { operation: 'close', courseId: term.courseId, revokedGrantCount },
    });

    return { term: updatedTerm, revokedGrantCount };
  }
}
