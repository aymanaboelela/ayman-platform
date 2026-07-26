import { cacheLife, cacheTag } from 'next/cache';
import { CatalogCourseDetailSchema, CatalogListSchema } from '@ayman/contracts';
import type { CatalogCourseDetail, CatalogList } from '@ayman/contracts';
import { apiGet, apiGetOrNull } from '@/lib/api';
import { TAG_COURSES, courseTag } from '@/lib/cache-tags';

/**
 * ⚠️ With `cacheComponents: true`, `fetch` is NOT cached by default and
 * blocks rendering. Every call into Nest from a Server Component is live
 * unless it is inside a `'use cache'` function — which is what these two
 * are for.
 */
export async function getCatalog(): Promise<CatalogList> {
  'use cache';
  cacheLife('hours');
  // ONE coarse tag. Tagging each course individually would put 128+ tags on
  // a single cacheTag call once the catalog grows, and the excess is
  // dropped with only a console warning — a silent correctness bug. The
  // list changes only when a course is published or unpublished, and that
  // operation invalidates this tag deliberately (setCourseStatusAction).
  cacheTag(TAG_COURSES);
  return apiGet('/api/catalog/courses', CatalogListSchema);
}

export async function getCourse(slug: string): Promise<CatalogCourseDetail | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(TAG_COURSES);

  const course = await apiGetOrNull(
    `/api/catalog/courses/${encodeURIComponent(slug)}`,
    CatalogCourseDetailSchema,
  );

  // The per-entity tag is only knowable AFTER the fetch, because the route
  // is keyed by slug and the tag is keyed by id. `cacheTag` may be called at
  // any point during the cached function's execution, including after an
  // await — this is the supported way to tag on data you just loaded.
  if (course) cacheTag(courseTag(course.id));

  return course;
}
