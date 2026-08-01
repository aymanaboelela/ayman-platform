import { z } from 'zod';
import { listResponse } from '@ayman/contracts/admin/list';
import { adminGet } from '@/lib/admin-api';

/**
 * The four numbers the admin overview opens with, assembled from endpoints
 * that already exist. There is deliberately no `GET /api/admin/stats`: three
 * of these four numbers fall out of list endpoints the admin already calls,
 * and a fifth endpoint returning counts is a second source of truth for
 * "how many courses are published".
 *
 * Only `students` reports a real total — every list endpoint returns
 * `{ rows, rowCount }` per `admin/list.ts`, and this asks for the smallest
 * legal page so the count arrives without the rows.
 *
 * `courses` is a plain array (no pagination on that route), so published and
 * draft counts are exact.
 *
 * `appeals` has neither a total nor a count route, so it is COUNTED UP TO A
 * CAP and rendered as `50+` at the ceiling. A triage queue only needs to
 * answer "is there work waiting, roughly how much" — inventing an exact
 * number by paging the whole queue on every dashboard render would cost far
 * more than the precision is worth.
 */
export const APPEALS_CAP = 50;

const StudentsCountSchema = listResponse(z.object({ id: z.string() }).loose());

const CoursesStatusSchema = z.array(
  z.object({ status: z.enum(['draft', 'published', 'archived']) }).loose(),
);

const AppealsCountSchema = z.array(z.unknown());

export interface AdminOverviewStats {
  students: number;
  published: number;
  drafts: number;
  /** True when `appeals` hit `APPEALS_CAP` and is a floor, not a total. */
  appeals: number;
  appealsCapped: boolean;
}

/**
 * Never throws. A stat strip is decoration on a page whose real job is the
 * section grid — one slow or failing count must not take the whole admin
 * overview down with it, which is exactly what an unguarded `Promise.all`
 * here would do. Callers render `statsUnavailable` when this returns null.
 */
export async function getAdminOverviewStats(): Promise<AdminOverviewStats | null> {
  const [students, courses, appeals] = await Promise.allSettled([
    adminGet('/api/admin/students?page=1&perPage=10', StudentsCountSchema),
    adminGet('/api/admin/courses', CoursesStatusSchema),
    adminGet(`/api/admin/appeals?status=open&take=${APPEALS_CAP}&skip=0`, AppealsCountSchema),
  ]);

  // All three failing means the admin API is unreachable, not that the numbers
  // are zero — and "0 students" is a far worse lie than showing nothing.
  if (
    students.status === 'rejected' &&
    courses.status === 'rejected' &&
    appeals.status === 'rejected'
  ) {
    return null;
  }

  const courseRows = courses.status === 'fulfilled' ? courses.value : [];
  const appealRows = appeals.status === 'fulfilled' ? appeals.value : [];

  return {
    students: students.status === 'fulfilled' ? students.value.rowCount : 0,
    published: courseRows.filter((course) => course.status === 'published').length,
    drafts: courseRows.filter((course) => course.status === 'draft').length,
    appeals: appealRows.length,
    appealsCapped: appealRows.length >= APPEALS_CAP,
  };
}
