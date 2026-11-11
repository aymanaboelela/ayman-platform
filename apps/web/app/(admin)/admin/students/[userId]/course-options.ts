import { z } from 'zod';
import { adminGet } from '@/lib/admin-api';
import type { ClosedCourse } from './course-access-section';
import type { SubscribableCourse } from './subscription-section';

const AdminCourseOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  requiresGrant: z.boolean(),
  monthlyPriceCents: z.number().int().nullable(),
  quarterlyPriceCents: z.number().int().nullable(),
  yearlyPriceCents: z.number().int().nullable(),
  // الترم الأول / الترم الثاني — `SubscriptionSection`'s own term option
  // finds its choices here.
  terms: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      isOpen: z.boolean(),
      priceCents: z.number().int().nullable(),
    }),
  ),
  // شهور المنهج — the monthly plan's own choices on a course that sells by
  // month. Empty on every course that does not.
  months: z.array(
    z.object({
      id: z.string(),
      monthIndex: z.number().int(),
      title: z.string(),
      isOpen: z.boolean(),
    }),
  ),
});

export interface StudentCourseOptions {
  /** For `<CourseAccessSection>` — closed courses only. */
  closedCourses: ClosedCourse[];
  /** For `<SubscriptionSection>` — published courses that sell a plan. */
  subscribableCourses: SubscribableCourse[];
}

/**
 * The two course lists the access controls offer, from ONE read of
 * `/api/admin/courses`.
 *
 * Two screens hold those controls now — the student page and the student
 * drawer in a chat (`inbox/[id]/student-panel`) — and the filters below are
 * the rules that make each control mean something. Written twice they would
 * drift, and a drawer offering a course the page refuses (or the reverse) is
 * the kind of disagreement nobody can explain to a student on the phone.
 *
 * `closedCourses`: a grant on an OPEN course is a no-op, so offering one
 * would be a control that does nothing.
 *
 * `subscribableCourses`: every priced course IS `requiresGrant` (the DB's own
 * `courses_priced_requires_grant` constraint), so the two lists overlap; they
 * serve different controls for different reasons and neither is built from
 * the other.
 */
export async function loadStudentCourseOptions(): Promise<StudentCourseOptions> {
  const courses = await adminGet('/api/admin/courses', z.array(AdminCourseOptionSchema));

  const closedCourses = courses
    .filter((course) => course.requiresGrant)
    .map((course) => ({ id: course.id, title: course.title }));

  const subscribableCourses = courses
    .filter(
      (course) =>
        course.status === 'published' &&
        (course.monthlyPriceCents !== null ||
          course.quarterlyPriceCents !== null ||
          course.yearlyPriceCents !== null ||
          course.terms.some((term) => term.priceCents !== null)),
    )
    .map((course) => ({
      id: course.id,
      title: course.title,
      monthlyPriceCents: course.monthlyPriceCents,
      quarterlyPriceCents: course.quarterlyPriceCents,
      yearlyPriceCents: course.yearlyPriceCents,
      // Every priced term is offered here, open or closed — the admin
      // manual-subscribe path is a deliberate override, unlike the
      // student-facing flow. See `SubscriptionSection`'s own doc.
      terms: course.terms.filter((term) => term.priceCents !== null),
      // Every month, open or closed, for the same override reason the terms
      // above are — the API does not gate on `isOpen` here either.
      months: course.months,
    }));

  return { closedCourses, subscribableCourses };
}
