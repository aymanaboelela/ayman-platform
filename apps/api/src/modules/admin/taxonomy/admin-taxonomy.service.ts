import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AcademicYearPatch,
  GovernoratePatch,
  SubjectCreate,
  SubjectOffering,
  SubjectOfferingPatch,
  SubjectPatch,
  SystemPatch,
  TrackCreate,
  TrackPatch,
} from '@ayman/contracts/admin/taxonomy';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin.constants';

/** Prisma's foreign-key-violation code — `onDelete: Restrict` surfaces as this. */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2003';
}

/**
 * Every write here is a small, focused mutation on a taxonomy entity plus
 * one audit entry. None of them touch `slug` — the two identity fields
 * (`EducationSystem.slug`, `Track.slug`) have no patch-schema key at all
 * (A13), so there is no code path here that could even attempt to change one.
 *
 * The taxonomy CACHE TAG is invalidated by the caller (the web Server
 * Action), not here — this service has no idea `apps/web` runs a `'use
 * cache'` loader over the same data, and coupling it to Next's cache API
 * would be a layering violation. See Task 4's `tags.taxonomy()`.
 */
@Injectable()
export class AdminTaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Governorates ──────────────────────────────────────────────────────

  /** Admin sees every row, including inactive ones — the public taxonomy hides those. */
  listGovernorates() {
    return this.prisma.governorate.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async patchGovernorate(code: string, input: GovernoratePatch) {
    const existing = await this.prisma.governorate.findUnique({ where: { code } });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.governorate.update({ where: { code }, data: input });

    await this.audit.record({
      action: 'taxonomy:update',
      resourceType: AUDIT_RESOURCES.taxonomy,
      resourceId: `governorate:${code}`,
      outcome: 'success',
      metadata: { entity: 'governorate', changed: input },
    });

    return updated;
  }

  // ── Education systems + academic years ───────────────────────────────

  listSystems() {
    return this.prisma.educationSystem.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { years: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /**
   * `passPercent` and `totalMarks` are audited with BOTH the old and new
   * value — those two numbers change every student's pass/fail rendering
   * retroactively, and "what was it before" is exactly what a support
   * investigation needs from the trail.
   */
  async patchSystem(id: string, input: SystemPatch) {
    const existing = await this.prisma.educationSystem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.educationSystem.update({ where: { id }, data: input });

    await this.audit.record({
      action: 'taxonomy:update',
      resourceType: AUDIT_RESOURCES.taxonomy,
      resourceId: `system:${id}`,
      outcome: 'success',
      metadata: {
        entity: 'education_system',
        changed: input,
        ...(input.passPercent !== undefined || input.totalMarks !== undefined
          ? {
              before: { passPercent: existing.passPercent, totalMarks: existing.totalMarks },
              after: { passPercent: updated.passPercent, totalMarks: updated.totalMarks },
            }
          : {}),
      },
    });

    return updated;
  }

  async patchAcademicYear(id: string, input: AcademicYearPatch) {
    const existing = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.academicYear.update({ where: { id }, data: input });

    await this.audit.record({
      action: 'taxonomy:update',
      resourceType: AUDIT_RESOURCES.taxonomy,
      resourceId: `academic_year:${id}`,
      outcome: 'success',
      metadata: { entity: 'academic_year', changed: input },
    });

    return updated;
  }

  // ── Tracks ────────────────────────────────────────────────────────────

  listTracks() {
    return this.prisma.track.findMany({ orderBy: [{ systemId: 'asc' }, { sortOrder: 'asc' }] });
  }

  async createTrack(input: TrackCreate) {
    const created = await this.prisma.track.create({ data: input });

    await this.audit.record({
      action: 'taxonomy:create',
      resourceType: AUDIT_RESOURCES.taxonomy,
      resourceId: `track:${created.id}`,
      outcome: 'success',
      metadata: { entity: 'track', created: input },
    });

    return created;
  }

  async patchTrack(id: string, input: TrackPatch) {
    const existing = await this.prisma.track.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.track.update({ where: { id }, data: input });

    await this.audit.record({
      action: 'taxonomy:update',
      resourceType: AUDIT_RESOURCES.taxonomy,
      resourceId: `track:${id}`,
      outcome: 'success',
      metadata: { entity: 'track', changed: input },
    });

    return updated;
  }

  // ── Subjects ──────────────────────────────────────────────────────────

  listSubjects() {
    return this.prisma.subject.findMany({ orderBy: { nameAr: 'asc' } });
  }

  async createSubject(input: SubjectCreate) {
    const created = await this.prisma.subject.create({ data: input });

    await this.audit.record({
      action: 'taxonomy:create',
      resourceType: AUDIT_RESOURCES.taxonomy,
      resourceId: `subject:${created.id}`,
      outcome: 'success',
      metadata: { entity: 'subject', created: input },
    });

    return created;
  }

  async patchSubject(id: string, input: SubjectPatch) {
    const existing = await this.prisma.subject.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.subject.update({ where: { id }, data: input });

    await this.audit.record({
      action: 'taxonomy:update',
      resourceType: AUDIT_RESOURCES.taxonomy,
      resourceId: `subject:${id}`,
      outcome: 'success',
      metadata: { entity: 'subject', changed: input },
    });

    return updated;
  }

  /**
   * There is no delete for `Governorate` at all (it is the FK target of
   * every student profile) — `isActive: false` via `patchGovernorate` is the
   * whole answer to "remove one". `Subject` DOES support delete, but
   * `onDelete: Restrict` means a subject with any `SubjectOffering` cannot be
   * removed; that constraint violation is caught here and reported as a
   * real 409, not a 500 wrapping a raw Postgres error.
   */
  async deleteSubject(id: string): Promise<void> {
    try {
      await this.prisma.subject.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException({
          code: 'subject_in_use',
          message: 'this subject is used by at least one subject offering',
        });
      }
      throw error;
    }

    await this.audit.record({
      action: 'taxonomy:archive',
      resourceType: AUDIT_RESOURCES.taxonomy,
      resourceId: `subject:${id}`,
      outcome: 'success',
      metadata: { entity: 'subject', operation: 'delete' },
    });
  }

  // ── Subject offerings ─────────────────────────────────────────────────

  listSubjectOfferings() {
    return this.prisma.subjectOffering.findMany({
      orderBy: [{ systemId: 'asc' }, { year: 'asc' }, { sortOrder: 'asc' }],
      include: { subject: true, track: true },
    });
  }

  async createSubjectOffering(input: SubjectOffering) {
    const created = await this.prisma.subjectOffering.create({ data: input });

    await this.audit.record({
      action: 'taxonomy:create',
      resourceType: AUDIT_RESOURCES.taxonomy,
      resourceId: `subject_offering:${created.id}`,
      outcome: 'success',
      metadata: { entity: 'subject_offering', created: input },
    });

    return created;
  }

  async patchSubjectOffering(id: string, input: SubjectOfferingPatch) {
    const existing = await this.prisma.subjectOffering.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    // The year-1-no-track rule is per-ROW, not per-field — a patch touching
    // only `marks` must still be evaluated against the row it would produce.
    const nextYear = input.year ?? existing.year;
    const nextTrackId = input.trackId === undefined ? existing.trackId : input.trackId;
    if (nextYear === 1 && nextTrackId !== null) {
      throw new BadRequestException('year 1 offerings cannot be scoped to a track');
    }

    const updated = await this.prisma.subjectOffering.update({ where: { id }, data: input });

    await this.audit.record({
      action: 'taxonomy:update',
      resourceType: AUDIT_RESOURCES.taxonomy,
      resourceId: `subject_offering:${id}`,
      outcome: 'success',
      metadata: { entity: 'subject_offering', changed: input },
    });

    return updated;
  }
}
