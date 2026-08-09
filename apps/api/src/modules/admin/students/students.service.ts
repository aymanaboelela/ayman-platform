import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  STUDENT_SORT_COLUMNS,
  type AdminGrantCreate,
  type AdminGrantRow,
  type AdminRoleChange,
  type AdminStudentDetail,
  type AdminStudentPatch,
  type AdminStudentRow,
} from '@ayman/contracts/admin/students';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

export interface StudentListQuery {
  page: number;
  perPage: number;
  q: string;
  governorate: string[];
  year: number[];
  track: string[];
  sort: string;
  dir: 'asc' | 'desc';
}

const DETAIL_SELECT = {
  userId: true,
  fullName: true,
  phone: true,
  gender: true,
  governorateCode: true,
  year: true,
  schoolName: true,
  schoolStream: true,
  fatherPhone: true,
  motherPhone: true,
  onboardingCompletedAt: true,
  createdAt: true,
  user: { select: { email: true, role: true } },
  governorate: { select: { nameAr: true } },
  system: { select: { slug: true } },
  track: { select: { labelAr: true } },
  electiveSubject: { select: { subject: { select: { nameAr: true } } } },
} satisfies Prisma.StudentProfileSelect;

type DetailRecord = Prisma.StudentProfileGetPayload<{ select: typeof DETAIL_SELECT }>;

function toDetail(record: DetailRecord): AdminStudentDetail {
  return {
    id: record.userId,
    fullName: record.fullName,
    email: record.user.email,
    phone: record.phone,
    gender: record.gender,
    governorateCode: record.governorateCode,
    governorateNameAr: record.governorate.nameAr,
    systemSlug: record.system?.slug ?? null,
    year: record.year,
    trackLabelAr: record.track?.labelAr ?? null,
    onboardingCompleted: record.onboardingCompletedAt != null,
    createdAt: record.createdAt.toISOString(),
    role: record.user.role,
    schoolName: record.schoolName,
    schoolStream: record.schoolStream,
    fatherPhone: record.fatherPhone,
    motherPhone: record.motherPhone,
    electiveSubjectNameAr: record.electiveSubject?.subject.nameAr ?? null,
  };
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: StudentListQuery): Promise<{ rows: AdminStudentRow[]; rowCount: number }> {
    // A3: the sort column resolves through a hardcoded map. `query.sort` never
    // reaches Prisma as a raw key.
    const sortKey = Object.hasOwn(STUDENT_SORT_COLUMNS, query.sort) ? query.sort : 'createdAt';
    const column = STUDENT_SORT_COLUMNS[sortKey as keyof typeof STUDENT_SORT_COLUMNS];

    const where: Prisma.StudentProfileWhereInput = {
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
              { user: { email: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(query.governorate.length > 0 ? { governorateCode: { in: query.governorate } } : {}),
      ...(query.year.length > 0 ? { year: { in: query.year } } : {}),
      ...(query.track.length > 0 ? { trackId: { in: query.track } } : {}),
    };

    // Count and page in one round trip. `rowCount` is the TOTAL, not the page.
    const [rowCount, records] = await this.prisma.$transaction([
      this.prisma.studentProfile.count({ where }),
      this.prisma.studentProfile.findMany({
        where,
        orderBy: [{ [column]: query.dir }, { userId: 'asc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: {
          userId: true,
          fullName: true,
          phone: true,
          gender: true,
          governorateCode: true,
          year: true,
          onboardingCompletedAt: true,
          createdAt: true,
          user: { select: { email: true } },
          governorate: { select: { nameAr: true } },
          system: { select: { slug: true } },
          track: { select: { labelAr: true } },
        },
      }),
    ]);

    return {
      rowCount,
      rows: records.map((record) => ({
        id: record.userId,
        fullName: record.fullName,
        email: record.user.email,
        phone: record.phone,
        gender: record.gender,
        governorateCode: record.governorateCode,
        governorateNameAr: record.governorate.nameAr,
        systemSlug: record.system?.slug ?? null,
        year: record.year,
        trackLabelAr: record.track?.labelAr ?? null,
        onboardingCompleted: record.onboardingCompletedAt != null,
        createdAt: record.createdAt.toISOString(),
      })),
    };
  }

  async detail(userId: string): Promise<AdminStudentDetail> {
    const record = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: DETAIL_SELECT,
    });
    if (!record) throw new NotFoundException();
    return toDetail(record);
  }

  /**
   * Every course-scoped grant this student holds, revoked ones included.
   *
   * Revoked rows are RETURNED, not filtered: "why can't this student open the
   * course any more" is answerable only if the revoked grant is visible, and a
   * list that silently drops them makes a removal indistinguishable from a
   * grant that was never issued.
   */
  async listGrants(userId: string): Promise<AdminGrantRow[]> {
    const grants = await this.prisma.accessGrant.findMany({
      where: { userId, scope: 'course' },
      orderBy: [{ revokedAt: 'asc' }, { validFrom: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        courseId: true,
        source: true,
        validFrom: true,
        validUntil: true,
        revokedAt: true,
        note: true,
        course: { select: { title: true } },
      },
    });

    return grants.map((grant) => ({
      id: grant.id,
      // `scope: 'course'` guarantees a course, but Prisma's type cannot say so.
      courseId: grant.courseId ?? '',
      courseTitle: grant.course?.title ?? '',
      source: grant.source,
      validFrom: grant.validFrom.toISOString(),
      validUntil: grant.validUntil?.toISOString() ?? null,
      revokedAt: grant.revokedAt?.toISOString() ?? null,
      note: grant.note,
    }));
  }

  /**
   * Opens one course for one student.
   *
   * `source: 'admin'` rather than `purchase`: nothing was paid through this
   * platform, and recording a purchase that did not happen would make the
   * audit trail a work of fiction the first time anyone reconciles it.
   *
   * An existing LIVE grant is returned as-is rather than duplicated — pressing
   * the button twice is not an error, and two open grants for one course would
   * make revoking it a two-step operation nobody would remember.
   */
  async grantCourse(
    userId: string,
    input: AdminGrantCreate,
    actorId: string,
  ): Promise<AdminGrantRow[]> {
    const [student, course] = await Promise.all([
      this.prisma.studentProfile.findUnique({ where: { userId }, select: { userId: true } }),
      this.prisma.course.findUnique({ where: { id: input.courseId }, select: { id: true } }),
    ]);
    if (!student || !course) throw new NotFoundException();

    const live = await this.prisma.accessGrant.findFirst({
      where: { userId, scope: 'course', courseId: input.courseId, revokedAt: null },
      select: { id: true },
    });

    if (!live) {
      await this.prisma.accessGrant.create({
        data: {
          userId,
          scope: 'course',
          courseId: input.courseId,
          source: 'admin',
          grantedByUserId: actorId,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          note: input.note,
        },
      });
    }

    await this.audit.record({
      action: 'student:grant-course',
      resourceType: 'access_grant',
      resourceId: input.courseId,
      outcome: 'success',
      metadata: { userId, alreadyHeld: Boolean(live), validUntil: input.validUntil },
    });

    return this.listGrants(userId);
  }

  /**
   * Closes it again — by STAMPING `revokedAt`, never by deleting the row.
   *
   * `resolveCourseAccess` reads `revokedAt` and reports `revoked` distinctly
   * from `no_grant`, which is what lets the admin see "this was taken away"
   * rather than "this never existed". A delete would erase that difference and
   * the audit trail with it.
   */
  async revokeGrant(userId: string, grantId: string): Promise<AdminGrantRow[]> {
    const grant = await this.prisma.accessGrant.findFirst({
      // `userId` in the WHERE, so a grant id from another student's account
      // cannot be revoked through this student's URL.
      where: { id: grantId, userId, scope: 'course' },
      select: { id: true, revokedAt: true, courseId: true },
    });
    if (!grant) throw new NotFoundException();

    if (grant.revokedAt === null) {
      await this.prisma.accessGrant.update({
        where: { id: grantId },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.record({
      action: 'student:revoke-course',
      resourceType: 'access_grant',
      resourceId: grant.courseId ?? grantId,
      outcome: 'success',
      metadata: { userId, alreadyRevoked: grant.revokedAt !== null },
    });

    return this.listGrants(userId);
  }

  async patch(userId: string, input: AdminStudentPatch): Promise<AdminStudentDetail> {
    const existing = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { userId: true, year: true, trackId: true },
    });
    if (!existing) throw new NotFoundException();

    // The DB CHECK (year 1 has no track) would reject this anyway, but a 400
    // with a real message beats a 500 wrapping a raw constraint violation.
    const nextYear = input.year === undefined ? existing.year : input.year;
    if (nextYear === 1 && existing.trackId !== null) {
      throw new BadRequestException('year 1 cannot have a track; clear the track first');
    }

    await this.prisma.studentProfile.update({ where: { userId }, data: input });

    await this.audit.record({
      action: 'student:update',
      resourceType: 'student_profile',
      resourceId: userId,
      outcome: 'success',
      metadata: { changed: input },
    });

    return this.detail(userId);
  }

  /**
   * A4: role changes are their own operation. Two extra guards beyond the
   * permission check, both of which have burned real products:
   *   - an admin cannot demote themselves — that is how you end up with zero
   *     admins and no way back in;
   *   - demoting the last remaining admin is refused for the same reason.
   */
  async changeRole(
    userId: string,
    input: AdminRoleChange,
    actorUserId: string,
  ): Promise<{ role: string }> {
    if (userId === actorUserId) {
      throw new ForbiddenException('you cannot change your own role');
    }

    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) throw new NotFoundException();

    if (target.role === 'admin' && input.role !== 'admin') {
      const admins = await this.prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1) throw new ForbiddenException('cannot demote the last remaining admin');
    }

    await this.prisma.user.update({ where: { id: userId }, data: { role: input.role } });

    await this.audit.record({
      action: 'student:role-change',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: { from: target.role, to: input.role, reason: input.reason },
    });

    return { role: input.role };
  }
}
