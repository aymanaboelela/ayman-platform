import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  STUDENT_SORT_COLUMNS,
  type AdminGrantCreate,
  type AdminGrantRow,
  type AdminRoleChange,
  type AdminStudentBulkDeleteFailure,
  type AdminStudentBulkDeleteResult,
  type AdminStudentDeleteBlocker,
  type AdminStudentDetail,
  type AdminStudentPatch,
  type AdminStudentRow,
  expectedDeleteIdentity,
} from '@ayman/contracts/admin/students';
import { ARGON2_OPTIONS } from '../../../auth/argon2-options';
import {
  emailIdentifier,
  phoneIdentifier,
  throttleKeyFor,
} from '../../../auth/credential-check.service';
import { loginThrottle } from '../../../auth/login-throttle.instance';
import { AuditService } from '../../../audit/audit.service';
import { isUniqueViolation } from '../../../common/prisma/prisma-errors';
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
    // Nullable column, passed straight through: `null` means the student gave
    // no address, and the table says so rather than showing a blank cell.
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
   *
   * ## ⚠️ Stamping the grant is NOT what closes the door
   *
   * It used to be the only thing this method did, and the effect was that
   * revoking a grant changed the admin's screen and nothing else. Every gate
   * the student actually passes through — `lesson-access.service`,
   * `player.service`, `quiz-access.service`, `dashboard.service`,
   * `path.service` — reads only `enrollments.status`, never the grant.
   * `resolveCourseAccess`, the one function that DOES read `revokedAt`, is
   * consulted in exactly one place: `EntitlementService.enroll`, at enrolment
   * time.
   *
   * So a student who had already enrolled kept full access to every lesson,
   * video, resource and quiz in the course, while the admin UI rendered the
   * grant as «مسحوب» and the audit log recorded a revocation. The one screen
   * that says "this student can no longer open this course" was the only place
   * it was true.
   *
   * The enrollment is therefore moved to `revoked` in the same transaction.
   * That value already existed in `EnrollmentStatus` and was written by no
   * production code path; `ACTIVE_ENROLLMENT_STATUSES` is `['active',
   * 'completed']`, so every gate above closes immediately with no new query on
   * any hot path.
   *
   * ## Why only when the course still requires a grant
   *
   * Revocation must not be able to lock a student out of a FREE course. The
   * admin UI only offers grants on `requiresGrant` courses, but a course can
   * be opened up later while an old grant row lingers — revoking that stale
   * row must then be a no-op on access, because access no longer flows from
   * the grant at all.
   *
   * ## What this deliberately does NOT change
   *
   * `enroll()`'s documented behaviour that a course flipped to `requiresGrant`
   * keeps its existing students («الأربعين طالب اللي جوه يخلّصوا»). That is a
   * property of the COURSE changing under them and stays untouched. An admin
   * revoking one named student's grant is the opposite act — a deliberate,
   * per-student decision — and it is the one this method now carries out.
   */
  async revokeGrant(userId: string, grantId: string): Promise<AdminGrantRow[]> {
    const grant = await this.prisma.accessGrant.findFirst({
      // `userId` in the WHERE, so a grant id from another student's account
      // cannot be revoked through this student's URL.
      where: { id: grantId, userId, scope: 'course' },
      select: { id: true, revokedAt: true, courseId: true },
    });
    if (!grant) throw new NotFoundException();

    // Read before the write: once the course is open, revoking a leftover
    // grant must not touch the enrollment. Null `courseId` cannot happen for
    // `scope: 'course'`, but the column is nullable so the type says it can.
    const course = grant.courseId
      ? await this.prisma.course.findUnique({
          where: { id: grant.courseId },
          select: { requiresGrant: true },
        })
      : null;
    const gated = course?.requiresGrant === true;

    const writes: Prisma.PrismaPromise<unknown>[] = [];

    if (grant.revokedAt === null) {
      writes.push(
        this.prisma.accessGrant.update({
          where: { id: grantId },
          data: { revokedAt: new Date() },
        }),
      );
    }

    if (gated && grant.courseId) {
      // `updateMany`, not `update`: there may be no enrollment at all (a grant
      // issued to a student who never opened the course), and `update` throws
      // on a missing row. Scoped to the statuses that grant access, so a row
      // already `completed`… is also closed — see below.
      writes.push(
        this.prisma.enrollment.updateMany({
          where: { userId, courseId: grant.courseId },
          data: { status: 'revoked' },
        }),
      );
    }

    if (writes.length > 0) await this.prisma.$transaction(writes);

    await this.audit.record({
      action: 'student:revoke-course',
      resourceType: 'access_grant',
      resourceId: grant.courseId ?? grantId,
      outcome: 'success',
      metadata: {
        userId,
        alreadyRevoked: grant.revokedAt !== null,
        // Recorded because it is the difference between "the student lost
        // access" and "nothing happened to their access", and the log is where
        // that question gets asked later.
        enrollmentRevoked: gated,
      },
    });

    return this.listGrants(userId);
  }

  /**
   * `phone` and `email` do not live on `StudentProfile` the way the rest of
   * this payload does. `phone` mirrors `User.phoneNumber` — the actual Better
   * Auth login identifier — onto `StudentProfile.phone` (see that column's
   * own note in `schema.prisma`); `email` lives on `User` alone. Both writes
   * go in ONE transaction, so the mirror can never desync: a phone change
   * that updated the login identity but left `student_profiles.phone`
   * disagreeing (or the other way round) would be worse than either value
   * alone, because nothing downstream would notice which one is stale.
   *
   * A duplicate phone or email raises Postgres's own unique constraint
   * (`users_phone_number_key` / `users_email_key` / `student_profiles_phone_key`)
   * rather than a pre-check racing another admin's concurrent write — caught
   * here and turned into one message rather than a raw `P2002`.
   */
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

    const { phone, email, ...profileInput } = input;

    const profileData: Prisma.StudentProfileUpdateInput = {
      ...profileInput,
      ...(phone !== undefined ? { phone } : {}),
    };
    const userData: Prisma.UserUpdateInput = {
      ...(phone !== undefined ? { phoneNumber: phone } : {}),
      ...(email !== undefined ? { email } : {}),
    };

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    if (Object.keys(profileData).length > 0) {
      writes.push(this.prisma.studentProfile.update({ where: { userId }, data: profileData }));
    }
    if (Object.keys(userData).length > 0) {
      writes.push(this.prisma.user.update({ where: { id: userId }, data: userData }));
    }

    try {
      await this.prisma.$transaction(writes);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'this phone number or email is already used by another account',
        );
      }
      throw error;
    }

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
   * تعيين كلمة سر جديدة — never a read, only an overwrite. Passwords are
   * Argon2id hashes; there is nothing to show an admin, only something to
   * replace.
   *
   * Deliberately NOT built on Better Auth's `admin` plugin, even though it
   * ships exactly this endpoint (`/admin/set-user-password`). Mounting the
   * plugin would add its OWN `role` / `banned` / `banReason` / `banExpires`
   * fields to the `user` table (`better-auth/plugins/admin`'s `schema`) —
   * columns this schema does not have and that would collide with the
   * hand-rolled `role` and `bannedAt`/`bannedReason`/`bannedByUserId` this
   * platform already uses for the exact same concepts, with a DIFFERENT
   * shape. Adopting it would mean a migration and a real risk of the two
   * systems disagreeing about who is banned or what role someone holds.
   *
   * What IS reused is the plugin's own LOGIC, read directly out of
   * `better-auth/dist/plugins/admin/routes.mjs`'s `setUserPassword` handler:
   * hash with the configured password hasher, then update the `credential`
   * account's password if one exists or create it if it does not (a phone-
   * only student who signed up via `/phone-number/verify` — not wired up
   * today, see `auth.config.ts` — would have no password account at all).
   * `accountId: userId` for the `credential` provider is Better Auth's own
   * convention, not a guess — `create-admin.ts`'s bootstrap script upserts on
   * that exact same `providerId_accountId` compound key.
   *
   * `argon2.hash` + `ARGON2_OPTIONS` is the SAME hasher `auth.config.ts` wires
   * into `emailAndPassword.password.hash` — not a second, independently
   * chosen one — so a password set here verifies through the ordinary sign-in
   * path with no special case.
   */
  async setPassword(userId: string, newPassword: string, actorUserId: string): Promise<{ status: true }> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      // The two login identifiers come back with the id because the soft lock
      // is keyed on THEM, not on the user — see the unlock below.
      select: { id: true, email: true, phoneNumber: true },
    });
    if (!target) throw new NotFoundException();

    const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);

    await this.prisma.account.upsert({
      where: { providerId_accountId: { providerId: 'credential', accountId: userId } },
      update: { password: passwordHash },
      create: {
        id: randomUUID(),
        providerId: 'credential',
        accountId: userId,
        userId,
        password: passwordHash,
      },
    });

    /**
     * ...and then let them actually USE it, which is the half that was
     * missing.
     *
     * `login-throttle.service` locks an account for 15 minutes after 10 failed
     * attempts, and `credential-check.service`'s `throttleKeyFor` namespaces
     * that ledger BY IDENTIFIER KIND — `phone:+2010…` and `email:…` are two
     * independent buckets for one student, deliberately (see that function).
     * The consequence in the field: a student who cannot get in tries their
     * number over and over, trips the phone lock, and asks for a new password.
     * The admin sets one, the student types it, and is refused again — while
     * the very same password works instantly through the email box, because
     * that bucket was never touched. It reads exactly like a set-password that
     * did not save, and it is what this method is usually called to fix.
     *
     * So both buckets are dropped here. Only the two identifiers this account
     * can actually sign in with, normalised the same way the sign-in path
     * normalises them, or the key would not match the one a failed attempt
     * wrote: `users.phone_number` is already E.164 (`planPhoneNormalization`
     * rewrites the body before anything stores it), and the email is folded to
     * lower case by `emailIdentifier`.
     *
     * Not inside the transaction and not awaited-then-checked: this is an
     * in-memory Map delete that cannot fail, and a password that was written
     * must not be reported as unwritten because of anything after it.
     */
    if (target.phoneNumber) {
      loginThrottle.clear(throttleKeyFor(phoneIdentifier(target.phoneNumber)));
    }
    if (target.email) {
      loginThrottle.clear(throttleKeyFor(emailIdentifier(target.email)));
    }

    // Never the password itself, hashed or otherwise — just who did it and to
    // whom. `audit_log` is INSERT-only; a credential belongs nowhere in it.
    await this.audit.record({
      action: 'student:set-password',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: { actorUserId },
    });

    return { status: true };
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
   * ## Why `confirmIdentity`
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
    input: { confirmIdentity: string; reason: string },
    actorUserId: string,
  ): Promise<{ deleted: true }> {
    const outcome = await this.attemptRemove(userId, actorUserId, input.reason, input.confirmIdentity);

    /*
     * The shared core returns codes; this route has always answered in HTTP
     * statuses, and every one of them is load-bearing on the web side —
     * `deleteStudentAction` branches on 409 to name the blockers and on 400 to
     * say «الإيميل مش مطابق». Translating here rather than throwing from the
     * core is what lets `removeMany` report the same four refusals per row
     * without a 409 taking the other nineteen deletes down with it.
     */
    if (!outcome.ok) {
      switch (outcome.reason) {
        case 'self':
          throw new ForbiddenException('you cannot delete your own account');
        case 'not-found':
          throw new NotFoundException();
        case 'email-mismatch':
          throw new BadRequestException('confirmation email does not match this account');
        case 'last-admin':
          throw new ForbiddenException('cannot delete the last remaining admin');
        case 'authored-content':
          throw new ConflictException({
            message: 'this account owns authored content and cannot be deleted',
            blockers: outcome.blockers,
          });
      }
    }

    return { deleted: true };
  }

  /**
   * مسح مجموعة — the list screen's bulk delete.
   *
   * ## Sequential, and that is not laziness
   *
   * `Promise.all` over a hundred ids would be both a hundred concurrent
   * multi-table cascades on one connection pool AND wrong: the last-admin guard
   * is a `count` re-read per account, so two admins deleted in parallel would
   * each see the other still present, both pass the check, and the platform
   * would be left with no way in. Run in sequence, the second one sees a count
   * of one and is refused — which is the behaviour the single-delete guard has
   * always promised.
   *
   * ## Every id is attempted, none are pre-validated
   *
   * There is no "check them all first, then delete them all" pass. It would
   * double the queries to buy an all-or-nothing guarantee this operation cannot
   * honour anyway — the deletes are separate transactions, and an admin whose
   * twentieth row is blocked wants the nineteen gone, not rolled back.
   */
  async removeMany(
    input: { userIds: string[]; reason: string },
    actorUserId: string,
  ): Promise<AdminStudentBulkDeleteResult> {
    const deleted: string[] = [];
    const failed: AdminStudentBulkDeleteFailure[] = [];

    // Deduped: the same id twice would delete once and then report `not-found`
    // for a row the admin watched disappear correctly.
    for (const userId of new Set(input.userIds)) {
      const outcome = await this.attemptRemove(userId, actorUserId, input.reason);

      if (outcome.ok) {
        deleted.push(userId);
        continue;
      }

      /*
       * `email-mismatch` is unreachable here — it is returned only when a
       * `confirmIdentity` was passed, and this caller passes none. The check is
       * for the type, not for the runtime: it is what makes the compiler prove
       * the union narrows to the four codes the contract's enum declares, so
       * adding a fifth refusal to the core cannot silently produce a response
       * that fails the client's parse.
       */
      if (outcome.reason === 'email-mismatch') continue;

      failed.push({ userId, name: outcome.name, reason: outcome.reason });
    }

    return { deleted, failed };
  }

  /**
   * Every check the delete has to pass, and the delete itself.
   *
   * Shared by `remove` (one account, confirmed by email, refusals as HTTP
   * statuses) and `removeMany` (many accounts, refusals as rows in a report).
   * Written once because the four guards below are the entire safety story of
   * the most destructive route in the admin, and a second copy of them is a
   * second thing to keep in step — the bulk path is exactly where a forgotten
   * last-admin check would be noticed only after the fact.
   */
  private async attemptRemove(
    userId: string,
    actorUserId: string,
    reason: string,
    confirmIdentity?: string,
  ): Promise<RemoveOutcome> {
    if (userId === actorUserId) return { ok: false, reason: 'self', name: '' };

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phoneNumber: true, name: true, role: true },
    });
    // No name to report: the row is already gone, which for a bulk delete is
    // usually a second tab having deleted it a moment ago.
    if (!target) return { ok: false, reason: 'not-found', name: '' };

    /**
     * Phone FIRST, email only as the fallback — and never the synthesised
     * placeholder.
     *
     * The point of this field is that the admin has to type something that
     * identifies the specific account, so typing it is impossible to do by
     * accident on the wrong row. A `…@phone.invalid` address identifies
     * nothing to a human: it is a string they have never seen and could not
     * recognise as belonging to the wrong student.
     *
     * The fallback still matters — accounts that predate the phone column, and
     * admins, genuinely have no number — so this resolves to whatever the
     * account actually has. `expectedDeleteIdentity` is exported so the admin
     * UI shows the very same string it will be compared against; if the two
     * ever disagreed, the dialog would be unpassable.
     */
    const expected = expectedDeleteIdentity({
      phone: target.phoneNumber,
      email: target.email,
    });
    /**
     * No identifier a human could type means no confirmation is possible.
     * Fail closed: refusing a delete costs an admin one support message,
     * whereas waving it through destroys an account with no check at all.
     */
    if (confirmIdentity !== undefined && expected === null) {
      return { ok: false, reason: 'email-mismatch', name: target.name };
    }

    // Case-insensitive and trimmed: the admin is retyping an identifier, not a
    // password, and rejecting «Ahmed@X.com» for «ahmed@x.com» would teach them
    // to paste it — which defeats the point of asking. Harmless for a phone,
    // which has no letters to fold.
    if (
      confirmIdentity !== undefined &&
      confirmIdentity.trim().toLowerCase() !== (expected ?? '').trim().toLowerCase()
    ) {
      return { ok: false, reason: 'email-mismatch', name: target.name };
    }

    if (target.role === 'admin') {
      const admins = await this.prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1) return { ok: false, reason: 'last-admin', name: target.name };
    }

    const [courses, questionBankEntries, questionVersions, newsPosts] = await Promise.all([
      this.prisma.course.count({ where: { instructorId: userId } }),
      this.prisma.questionBankEntry.count({ where: { ownerId: userId } }),
      this.prisma.questionVersion.count({ where: { createdBy: userId } }),
      this.prisma.newsPost.count({ where: { authorId: userId } }),
    ]);

    if (courses + questionBankEntries + questionVersions + newsPosts > 0) {
      const blockers = { courses, questionBankEntries, questionVersions, newsPosts };
      await this.audit.record({
        action: 'student:delete',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'failure',
        metadata: { reason, blockedBy: blockers },
      });
      return { ok: false, reason: 'authored-content', name: target.name, blockers };
    }

    /**
     * Written first: once the row is gone `resourceId` resolves to nothing, so
     * whatever identifies this person is captured here or it is lost forever.
     *
     * `phone` was added alongside `email` when the phone became the identity.
     * Without it this record could preserve nothing but a synthesised
     * `…@phone.invalid` string for a phone-only student — which is to say the
     * audit trail for the platform's most destructive action would name an
     * address that never existed, and nothing else. `audit_log` is
     * INSERT-only, so a record that loses this cannot be corrected later.
     */
    await this.audit.record({
      action: 'student:delete',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: {
        email: target.email,
        phone: target.phoneNumber,
        name: target.name,
        reason,
        actorUserId,
      },
    });

    await this.prisma.user.delete({ where: { id: userId } });

    return { ok: true, name: target.name };
  }
}

/**
 * The shared delete core's answer. `email-mismatch` is the one code with no
 * counterpart in `STUDENT_BULK_DELETE_FAILURES`: it can only arise on the
 * single-account path, which is the only one that has an email to compare.
 */
type RemoveOutcome =
  | { ok: true; name: string }
  | { ok: false; reason: 'authored-content'; name: string; blockers: AdminStudentDeleteBlocker }
  | { ok: false; reason: Exclude<AdminStudentBulkDeleteFailure['reason'], 'authored-content'> | 'email-mismatch'; name: string };
