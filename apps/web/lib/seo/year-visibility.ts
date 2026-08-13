/**
 * Whether `/years/[year]` should be indexed — asked by two callers that must
 * never disagree.
 *
 * `app/sitemap.ts` decides whether to list the URL; the page's own
 * `generateMetadata` decides whether to send `noindex`. Listing a `noindex`
 * URL in a sitemap is reported as an error in Search Console rather than
 * quietly ignored, so the two answers have to come from one place. They were
 * briefly two copies of the same condition, which is the shape of a rule that
 * drifts the first time either side is touched.
 *
 * The rule: index a year that has at least one published course.
 *
 * ⚠️ `courses.length === 0` returning `true` is deliberate and is the whole
 * reason this is not a one-line `.some()`. `getCatalogOrEmpty` yields an empty
 * list for an UNREACHABLE API exactly as it does for a genuinely empty
 * catalogue, and the two are indistinguishable at this layer. Treating "no
 * catalogue at all" as "index everything" means a transient API failure during
 * a build produces the old, harmless behaviour; the alternative is a build that
 * quietly deindexes every year page because Nest happened to be restarting.
 * Wrong-and-harmless beats wrong-and-silent here.
 */
export function isYearIndexable(
  courses: readonly { year: number }[],
  year: number,
): boolean {
  if (courses.length === 0) return true;
  return courses.some((course) => course.year === year);
}
