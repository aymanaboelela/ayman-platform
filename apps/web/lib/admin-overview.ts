import { z } from 'zod';
import { listResponse } from '@ayman/contracts/admin/list';
import { adminGet } from '@/lib/admin-api';

/**
 * The three numbers the admin overview opens with, assembled from endpoints
 * that already exist. There is deliberately no `GET /api/admin/stats`: both of
 * these calls are list endpoints the admin already hits, and a third endpoint
 * returning counts is a second source of truth for "how many courses are
 * published".
 *
 * Only `students` reports a real total — every list endpoint returns
 * `{ rows, rowCount }` per `admin/list.ts`, and this asks for the smallest
 * legal page so the count arrives without the rows.
 *
 * `courses` is a plain array (no pagination on that route), so published and
 * draft counts are exact.
 *
 * There used to be a fourth: open appeals, counted up to a cap and rendered as
 * `50+`. Appeals are gone, and the tile went with them rather than being
 * refilled with a number nobody asked for.
 */
const StudentsCountSchema = listResponse(z.object({ id: z.string() }).loose());

const CoursesStatusSchema = z.array(
  z.object({ status: z.enum(['draft', 'published', 'archived']) }).loose(),
);

export interface AdminOverviewStats {
  students: number;
  published: number;
  drafts: number;
}

/**
 * Never throws. A stat strip is decoration on a page whose real job is the
 * section grid — one slow or failing count must not take the whole admin
 * overview down with it, which is exactly what an unguarded `Promise.all`
 * here would do. Callers render `statsUnavailable` when this returns null.
 */
export async function getAdminOverviewStats(): Promise<AdminOverviewStats | null> {
  const [students, courses] = await Promise.allSettled([
    adminGet('/api/admin/students?page=1&perPage=10', StudentsCountSchema),
    adminGet('/api/admin/courses', CoursesStatusSchema),
  ]);

  // Both failing means the admin API is unreachable, not that the numbers are
  // zero — and "0 students" is a far worse lie than showing nothing.
  if (students.status === 'rejected' && courses.status === 'rejected') return null;

  const courseRows = courses.status === 'fulfilled' ? courses.value : [];

  return {
    students: students.status === 'fulfilled' ? students.value.rowCount : 0,
    published: courseRows.filter((course) => course.status === 'published').length,
    drafts: courseRows.filter((course) => course.status === 'draft').length,
  };
}
