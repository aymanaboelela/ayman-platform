import type { AdminConversationDetail } from '@ayman/contracts/assistant/conversation';

type ThreadCourse = NonNullable<AdminConversationDetail['courses']>[number];

/** One live grant, as `AssistantService.detail` selects it. */
export interface ThreadGrantRow {
  courseId: string | null;
  scope: string;
  source: string;
  validUntil: Date | null;
  course: { title: string } | null;
  term: { title: string } | null;
  month: { monthIndex: number; title: string } | null;
}

/**
 * The inbox header's «مشترك في إيه», one entry per course.
 *
 * A student on the monthly plan holds one `course_month` grant PER MONTH, so
 * a list of grants is the wrong unit for a badge: three months of the same
 * course would be three identical course badges that never say which months.
 * Grouping here puts the months on the one badge they belong to.
 *
 * A whole-course grant subsumes any month or term on the same course — the
 * student can open everything, and listing «شهر ١، ٢» next to it would read
 * as a restriction that does not exist.
 *
 * Order is first appearance, and the query is newest-grant-first, so the
 * course the student most recently bought stays leftmost — the order the
 * header already had.
 */
export function groupGrantsByCourse(grants: readonly ThreadGrantRow[]): ThreadCourse[] {
  const byCourse = new Map<
    string,
    {
      title: string;
      sources: string[];
      whole: boolean;
      /** `undefined` until a whole-course grant is seen; `null` = never expires. */
      wholeUntil: Date | null | undefined;
      terms: string[];
      months: Map<number, string>;
    }
  >();

  for (const grant of grants) {
    if (!grant.courseId) continue;
    let entry = byCourse.get(grant.courseId);
    if (!entry) {
      entry = {
        title: grant.course?.title ?? '',
        sources: [],
        whole: false,
        wholeUntil: undefined,
        terms: [],
        months: new Map(),
      };
      byCourse.set(grant.courseId, entry);
    }
    entry.sources.push(grant.source);

    if (grant.scope === 'course') {
      entry.whole = true;
      // The most generous of two overlapping grants is the one that decides
      // what the student can open — and a `null` end is the most generous.
      entry.wholeUntil =
        entry.wholeUntil === null || grant.validUntil === null
          ? null
          : entry.wholeUntil === undefined || grant.validUntil > entry.wholeUntil
            ? grant.validUntil
            : entry.wholeUntil;
    } else if (grant.scope === 'term' && grant.term) {
      if (!entry.terms.includes(grant.term.title)) entry.terms.push(grant.term.title);
    } else if (grant.scope === 'course_month' && grant.month) {
      entry.months.set(grant.month.monthIndex, grant.month.title);
    }
  }

  return [...byCourse].map(([courseId, entry]) => ({
    courseId,
    courseTitle: entry.title,
    /*
     * «بالإيد» only when EVERYTHING on this course was opened by hand. One
     * paid month next to a hand-opened one is a paying student, and labelling
     * the badge «بالإيد» would tell him the opposite.
     */
    source: entry.sources.every((source) => source === 'admin')
      ? 'admin'
      : (entry.sources.find((source) => source !== 'admin') ?? 'admin'),
    // A month or term grant has no end date by construction — see
    // `AccessGrant.monthId`/`validUntil` in the schema.
    validUntil: entry.whole ? (entry.wholeUntil?.toISOString() ?? null) : null,
    whole: entry.whole,
    terms: entry.whole ? [] : entry.terms,
    months: entry.whole
      ? []
      : [...entry.months]
          .sort(([a], [b]) => a - b)
          .map(([index, title]) => ({ index, title })),
  }));
}
