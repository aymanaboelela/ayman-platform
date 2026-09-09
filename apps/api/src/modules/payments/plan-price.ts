/**
 * Which of a course's prices a plan costs.
 *
 * Two call sites need this and both used to inline the same ternary: the
 * student's own claim (`PaymentsService.submit`) and an admin recording one by
 * hand (`adminManualSubscribe`). The two disagreeing about what a plan costs
 * would put a wrong figure into revenue from one of the two doors into the
 * same operation, so the selection lives in one place rather than two.
 */

export type PlanPriceSource = {
  monthlyPriceCents: number | null;
  quarterlyPriceCents: number | null;
  yearlyPriceCents: number | null;
};

/**
 * `null` when the course does not sell that plan — which every caller turns
 * into a 400, because a price the platform does not have is not something a
 * student can be asked to send.
 *
 * `term` reads its price off the TERM, not the course, so callers pass it in:
 * resolving which term was meant needs a courseId-scoped lookup that this
 * arithmetic has no business doing.
 */
export function resolvePlanPriceCents(
  course: PlanPriceSource,
  plan: 'monthly' | 'quarterly' | 'yearly' | 'term',
  termPriceCents: number | null,
): number | null {
  switch (plan) {
    case 'monthly':
      return course.monthlyPriceCents;
    case 'quarterly':
      return course.quarterlyPriceCents;
    case 'yearly':
      return course.yearlyPriceCents;
    case 'term':
      return termPriceCents;
  }
}
