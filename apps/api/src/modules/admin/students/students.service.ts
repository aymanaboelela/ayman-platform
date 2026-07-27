import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  STUDENT_SORT_COLUMNS,
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
