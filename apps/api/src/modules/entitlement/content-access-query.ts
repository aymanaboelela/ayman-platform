import type { EnrollmentSource, Prisma } from '../../generated/prisma/client';
import { courseAccessScopes, hasLiveCourseAccess, type CourseAccessSubject } from './grant-liveness';
import { CONTENT_SCOPES, EMPTY_CONTENT_SLICE, contentSliceOf, type ContentAccess } from './content-access';

/** The two tables the question reads — a `PrismaService` or a transaction. */
type Db = Pick<Prisma.TransactionClient, 'accessGrant'>;

/**
 * «فتح بكود» for one student and one course: which units/lectures their live
 * code grants open, and whether codes are ALL they hold here.
 *
 * A plain function over a client rather than a method, so the three readers
 * that must agree on it — the lesson gate (through `EntitlementService`), the
 * dashboard's lecture counts and the progress bar's denominator (which runs
 * inside a transaction) — call the SAME code. See `ContentAccess` for why
 * `codeOnly` exists at all.
 *
 * One indexed read (`access_grants (user_id, course_id, scope)`) for every
 * student, empty for nearly all of them. The second read only happens for an
 * enrollment a code created, on a course that needs a grant.
 */
export async function resolveContentAccess(
  db: Db,
  userId: string,
  course: CourseAccessSubject,
  enrollmentSource: EnrollmentSource | null,
): Promise<ContentAccess> {
  const now = new Date();
  const grants = await db.accessGrant.findMany({
    where: { userId, courseId: course.id, scope: { in: [...CONTENT_SCOPES] } },
    select: {
      id: true,
      scope: true,
      sectionId: true,
      lessonId: true,
      validFrom: true,
      validUntil: true,
      revokedAt: true,
    },
  });
  const slice = grants.length > 0 ? contentSliceOf(grants, now) : EMPTY_CONTENT_SLICE;

  if (enrollmentSource !== 'code' || !course.requiresGrant) {
    return { slice, codeOnly: false };
  }

  const wide = await db.accessGrant.findMany({
    where: { userId, OR: courseAccessScopes(course) },
    select: {
      scope: true,
      courseId: true,
      subjectId: true,
      validFrom: true,
      validUntil: true,
      revokedAt: true,
    },
  });
  return { slice, codeOnly: !hasLiveCourseAccess(wide, course, now) };
}

/**
 * The lecture filter a COUNT must use once codes are in play — the dashboard's
 * «٠ من ٢ درس» and the progress bar's denominator.
 *
 * `monthFilter` is what the month slice already narrowed to (`undefined` when
 * the course is not narrowed at all). Code-opened lectures are ADDED to it;
 * and for a student whose only standing is codes, they are ALL of it. Without
 * this a code-only student on a month-selling course counted zero lectures and
 * the dashboard drew the course as «قريبًا» — the one thing they had just paid
 * for.
 */
export function lessonFilterWithCodes(
  monthFilter: Prisma.LessonWhereInput | undefined,
  content: ContentAccess,
): Prisma.LessonWhereInput | undefined {
  const opened: Prisma.LessonWhereInput[] = [];
  if (content.slice.lessons.size > 0) opened.push({ id: { in: [...content.slice.lessons.keys()] } });
  if (content.slice.sections.size > 0) {
    opened.push({ sectionId: { in: [...content.slice.sections.keys()] } });
  }
  if (content.codeOnly) return { OR: opened.length > 0 ? opened : [{ id: { in: [] } }] };
  if (opened.length === 0 || monthFilter === undefined) return monthFilter;
  return { OR: [monthFilter, ...opened] };
}
