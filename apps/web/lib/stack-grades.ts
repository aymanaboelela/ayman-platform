import type { Grade } from '@ayman/contracts/grades';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { gradesOf } from '@/lib/tenant-grades';

/**
 * The grades this stack teaches NOW, for a server component or route — its
 * admin's «الصفوف», read off the cached taxonomy (`/api/taxonomy` resolves the
 * saved setting against the build-time `TENANT_GRADES`). A failed read falls
 * back to the build-time list, the same answer the page gave before the
 * setting existed.
 *
 * Its own module, not an export of `lib/tenant-grades.ts`: that one is
 * imported by client components, and this pulls in the server-side loader.
 */
export async function getStackGrades(): Promise<readonly Grade[]> {
  return gradesOf(await getTaxonomyOrNull());
}
