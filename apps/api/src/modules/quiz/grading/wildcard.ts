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
 *   3. Un-escape `\*` back to a literal `*` inside each bit, then regex-escape
 *      the whole bit. (Order matters: escaping first would leave `\\*`.)
 *   4. Rejoin with `.*` and anchor with ^…$.
 *   5. Add the `i` flag when the question is case-insensitive.
 */
const NON_ESCAPED_ASTERISK = /(?<!\\)\*/;
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(input: string): string {
  return input.replace(REGEXP_SPECIALS, '\\$&');
}

export function compareStringWithWildcard(
  value: string,
  pattern: string,
  ignoreCase: boolean,
): boolean {
  if (pattern === '') return false;

  const normalisedPattern = pattern.normalize('NFC');
  const normalisedValue = value.normalize('NFC').trim();

  const bits = normalisedPattern
    .split(NON_ESCAPED_ASTERISK)
    .map((bit) => escapeRegExp(bit.replaceAll('\\*', '*')));

  // The `u` flag is safe here: escapeRegExp only ever emits escapes that are
  // valid under Unicode mode.
  const expression = new RegExp(`^${bits.join('.*')}$`, ignoreCase ? 'iu' : 'u');
  return expression.test(normalisedValue);
}
