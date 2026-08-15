import {
  BadRequestException,
  ConflictException,
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
  user: {
    select: {
      email: true,
      role: true,
      bannedAt: true,
      bannedReason: true,
      // The issuer by NAME, not id — an admin reading «اتحظر بواسطة» wants a
      // person, and the id would need a second lookup on every render. Nested
      // rather than denormalised because a ban outlives its issuer
      // (`ON DELETE SET NULL`), so this is legitimately nullable.
      bannedBy: { select: { name: true } },
    },
  },
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
    bannedAt: record.user.bannedAt?.toISOString() ?? null,
    bannedReason: record.user.bannedReason,
    bannedByName: record.user.bannedBy?.name ?? null,
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
          // `bannedAt` on the LIST too, not just the detail: an admin scanning
          // the table needs to see which accounts are locked out without
          // opening each one.
          user: { select: { email: true, bannedAt: true } },
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
        bannedAt: record.user.bannedAt?.toISOString() ?? null,
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

  /**
   * حظر — lock the account out, keep everything it owns.
   *
   * ## Why this is two writes and not one
   *
   * Setting `bannedAt` alone does NOT lock anybody out. The column is only
   * consulted by `databaseHooks.session.create.before` in `auth.config.ts`,
   * which — as its name says — runs when a session is CREATED. A student who
   * is already signed in holds a 90-day session that no amount of flag-setting
   * touches, so the ban would appear to work (the row says banned, the UI says
   * banned) while the student carried on studying until their session expired
   * three months later.
   *
   * So the sessions are deleted in the same transaction. `session.cookieCache`
   * is deliberately absent from `auth.config.ts`, which means every request
   * re-reads the session row from the database — so deleting the rows takes
   * effect on the student's very next request, not whenever a cached cookie
   * happens to lapse.
   *
   * `sessionDevice` rows go too. They are the «أجهزتي» list, and a device list
   * that still shows «نشط» for an account that can no longer sign in is a lie
   * the student would be reading at exactly the wrong moment.
   *
   * ## Guards
   *
   * Self-ban and last-admin are refused for the same reasons `changeRole`
   * refuses them, and the reasoning there applies verbatim: an admin who bans
   * themselves has locked the platform, and there is no recovery path in this
   * product that does not involve a database console.
   */
  async ban(userId: string, reason: string, actorUserId: string): Promise<AdminStudentDetail> {
    if (userId === actorUserId) {
      throw new ForbiddenException('you cannot ban yourself');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, bannedAt: true },
    });
    if (!target) throw new NotFoundException();

    if (target.role === 'admin') {
      const admins = await this.prisma.user.count({
        where: { role: 'admin', bannedAt: null },
      });
      if (admins <= 1) throw new ForbiddenException('cannot ban the last remaining admin');
    }

    // Idempotent: re-banning an already-banned student refreshes the reason and
    // re-clears any session created in between rather than 409-ing. An admin
    // pressing the button twice is not an error worth surfacing.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { bannedAt: new Date(), bannedReason: reason, bannedByUserId: actorUserId },
      }),
      this.prisma.session.deleteMany({ where: { userId } }),
      this.prisma.sessionDevice.deleteMany({ where: { userId } }),
    ]);

    await this.audit.record({
      action: 'student:ban',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: { reason, wasAlreadyBanned: target.bannedAt != null },
    });

    return this.detail(userId);
  }

  /**
   * رفع الحظر. Clears all three columns together — leaving `bannedReason`
   * behind would show a stale reason next to an active account the next time
   * anyone opened the record.
   *
   * Sessions are NOT restored, and cannot be: they were deleted, not disabled.
   * The student signs in again normally, which is the correct outcome — an
   * unban should not silently resurrect a session on a device they may no
   * longer have.
   */
  async unban(userId: string, actorUserId: string): Promise<AdminStudentDetail> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { bannedAt: true },
    });
    if (!target) throw new NotFoundException();

    await this.prisma.user.update({
      where: { id: userId },
      data: { bannedAt: null, bannedReason: null, bannedByUserId: null },
    });

    await this.audit.record({
      action: 'student:unban',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: { wasBanned: target.bannedAt != null, actorUserId },
    });

    return this.detail(userId);
  }

  /**
   * مسح — irreversible removal of the account.
   *
   * ## What actually gets destroyed, and what survives
   *
   * The row is deleted and Postgres cascades. From the FK map in
   * `schema.prisma`, that removes: sessions, accounts (the password hash),
   * the student profile, session devices, enrolments, access grants held,
   * quiz attempts (and through them every answer), and notifications.
   *
   * Two things deliberately SURVIVE, both by `ON DELETE SET NULL` declared on
   * the far side rather than by anything this method does:
   *   · `Conversation` — a المساعد thread the student opened. The instructor's
   *     replies are his own record of what was asked and answered.
   *   · `AttemptQuestion.gradedBy` — who graded an answer. Deleting a grader
   *     must not erase the fact that grading happened.
   *
   * ## Why a delete can be refused
   *
   * Four relations point at `users` with `ON DELETE RESTRICT`: `courses`
   * (instructor), `question_bank_entries`, `question_versions` and
   * `news_posts`. Those are AUTHORED content, and the restriction is correct —
   * cascading them would let one click destroy a published course.
   *
   * A student has none of these, so the ordinary case is unaffected. But
   * without this check an admin deleting a colleague's account gets a raw
   * Postgres foreign-key violation surfaced as a 500, with nothing telling
   * them what to do about it. So the blockers are counted FIRST and returned
   * as a 409 naming each one.
   *
   * ## Why `confirmEmail`
   *
   * See `AdminStudentDeleteSchema`. The id in the URL is unreadable; the email
   * is the only part of this operation an admin can actually verify they have
   * the right account. Checked here and not only in the UI, so it holds when
   * the endpoint is called directly.
   *
   * The audit entry is written BEFORE the delete, and records the email rather
   * than only the id: after the row is gone the id resolves to nothing, and an
   * audit trail whose subject cannot be identified is not one.
   */
  async remove(
    userId: string,
    input: { confirmEmail: string; reason: string },
    actorUserId: string,
  ): Promise<{ deleted: true }> {
    if (userId === actorUserId) {
      throw new ForbiddenException('you cannot delete your own account');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, role: true },
    });
    if (!target) throw new NotFoundException();

    // Case-insensitive and trimmed: the admin is retyping an address, not a
    // password, and rejecting «Ahmed@X.com» for «ahmed@x.com» would teach them
    // to paste it — which defeats the point of asking.
    if (input.confirmEmail.trim().toLowerCase() !== target.email.trim().toLowerCase()) {
      throw new BadRequestException('confirmation email does not match this account');
    }

    if (target.role === 'admin') {
      const admins = await this.prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1) throw new ForbiddenException('cannot delete the last remaining admin');
    }

    const [courses, questionBankEntries, questionVersions, newsPosts] = await Promise.all([
      this.prisma.course.count({ where: { instructorId: userId } }),
      this.prisma.questionBankEntry.count({ where: { ownerId: userId } }),
      this.prisma.questionVersion.count({ where: { createdBy: userId } }),
      this.prisma.newsPost.count({ where: { authorId: userId } }),
    ]);

    if (courses + questionBankEntries + questionVersions + newsPosts > 0) {
      await this.audit.record({
        action: 'student:delete',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'failure',
        metadata: {
          reason: input.reason,
          blockedBy: { courses, questionBankEntries, questionVersions, newsPosts },
        },
      });
      throw new ConflictException({
        message: 'this account owns authored content and cannot be deleted',
        blockers: { courses, questionBankEntries, questionVersions, newsPosts },
      });
    }

    // Written first: once the row is gone `resourceId` resolves to nothing, so
    // the email and name are captured here or they are lost.
    await this.audit.record({
      action: 'student:delete',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: { email: target.email, name: target.name, reason: input.reason, actorUserId },
    });

    await this.prisma.user.delete({ where: { id: userId } });

    return { deleted: true };
  }
}
