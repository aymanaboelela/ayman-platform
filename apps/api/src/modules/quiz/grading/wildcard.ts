/**
 * Port of Moodle's qtype_shortanswer_question::compare_string_with_wildcard().
 *
 * The algorithm, step for step:
 *   1. NFC-normalise the pattern and the response. Arabic in particular can
 *      arrive decomposed (ا + hamza) from one keyboard and composed (أ) from
 *      another; without this they are different strings and the student is
 *      marked wrong for typing the same word. NFC only recomposes a
 *      decomposed base+combining-mark SEQUENCE into its precomposed
 *      codepoint — it does not merge distinct letters (أ/إ/آ, ة/ه, ى/ي stay
 *      distinct) and it does not strip tashkeel (combining diacritics with no
 *      precomposed form). Those stay exactly as different as they are.
 *   2. Split the pattern on asterisks that are not backslash-escaped.
 *   3. Un-escape `\*` back to a literal `*` inside each segment.
 *   4. Match the segments against the value with a linear two-pointer scan:
 *      the first segment must anchor the START, the last segment must anchor
 *      the END, and every segment in between is located with a single
 *      forward `indexOf` scan — never a regex, never backtracking.
 *   5. Case-insensitivity is applied by lower-casing both sides up front.
 *
 * B6 — WHY NOT A REGEX. The previous implementation built `new RegExp('^' +
 * bits.map(escapeRegExp).join('.*') + '$')` and ran `.test()`. A pattern with
 * only a handful of wildcards (the ordinary "must mention X, then Y, then Z"
 * shape — `*for*loop*end*`) compiled to an expression the V8/Irregexp engine
 * backtracks catastrophically on for certain long inputs: measured on this
 * exact ported implementation, `*for*loop*end*` against 20,000 characters of
 * repeated "forloop" took 29 SECONDS, and `*قانون*نيوتن*الأول*` against
 * 20,000 chars took 50.6s — synchronous, on the main event loop, INSIDE the
 * grading transaction (`gradeAndFinalise`/`checkAnswer`), so a single
 * authenticated student could freeze the entire Node process repeatedly with
 * a benign three-wildcard instructor pattern and a long answer. The
 * algorithm below is a textbook multi-segment glob matcher: each of the
 * (at most `pattern.length`) segments is located with one linear scan over
 * the remaining value, so the whole match is bounded by
 * O(pattern.length * value.length) with no exponential case — it cannot
 * backtrack because it never guesses and un-guesses a split point, it just
 * takes the leftmost occurrence of each segment and moves on.
 */
const NON_ESCAPED_ASTERISK = /(?<!\\)\*/;

/** Un-escapes `\*` back to a literal `*`. No other characters are special —
 *  this is a literal-segment matcher, not a regex, so nothing else needs
 *  escaping at all (the previous regex-based version's `escapeRegExp` step
 *  no longer exists because there is no regex to escape INTO). */
function unescapeAsterisk(segment: string): string {
  return segment.replaceAll('\\*', '*');
}

/**
 * True iff `value` matches the glob `segments.join('*')`, anchored at both
 * ends. `segments` have already been un-escaped and case-folded by the
 * caller. Pure string scanning — no regex construction, no backtracking.
 */
function matchesSegments(value: string, segments: readonly string[]): boolean {
  const first = segments[0]!;
  if (!value.startsWith(first)) return false;

  const last = segments[segments.length - 1]!;
  if (segments.length === 1) {
    // No asterisk in the pattern at all: the anchored start-match above IS
    // the whole match iff it consumes the entire value.
    return value.length === first.length;
  }
  if (!value.endsWith(last)) return false;

  // `limit` is the last index the "middle" (the region every non-anchor
  // segment must be found within) may run up to — beyond it belongs to the
  // already-verified trailing `last` segment, and letting a middle segment's
  // match creep into that region would double-count characters that must
  // belong to `last` alone.
  const limit = value.length - last.length;
  let pos = first.length;

  for (const segment of segments.slice(1, -1)) {
    if (segment === '') continue; // consecutive `**` collapses to one `.*`
    const idx = value.indexOf(segment, pos);
    if (idx === -1 || idx + segment.length > limit) return false;
    pos = idx + segment.length;
  }

  return pos <= limit;
}

export function compareStringWithWildcard(
  value: string,
  pattern: string,
  ignoreCase: boolean,
): boolean {
  if (pattern === '') return false;

  const normalisedPattern = pattern.normalize('NFC');
  const normalisedValue = value.normalize('NFC').trim();

  const segments = normalisedPattern.split(NON_ESCAPED_ASTERISK).map(unescapeAsterisk);

  if (ignoreCase) {
    return matchesSegments(
      normalisedValue.toLowerCase(),
      segments.map((segment) => segment.toLowerCase()),
    );
  }
  return matchesSegments(normalisedValue, segments);
}
