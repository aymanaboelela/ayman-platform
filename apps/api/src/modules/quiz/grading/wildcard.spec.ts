import { compareStringWithWildcard } from './wildcard';

// Ported from Moodle's qtype_shortanswer_question::compare_string_with_wildcard():
// split the pattern on non-escaped asterisks, escape every other bit, rejoin
// with `.*`, anchor both ends, NFC-normalise both sides, add the `i` flag when
// the question is case-insensitive.
describe('compareStringWithWildcard', () => {
  it('matches an exact string', () => {
    expect(compareStringWithWildcard('for', 'for', true)).toBe(true);
    expect(compareStringWithWildcard('fort', 'for', true)).toBe(false);
  });

  it('anchors both ends — a substring is not a match', () => {
    expect(compareStringWithWildcard('a for loop', 'for', true)).toBe(false);
  });

  it('treats * as .*', () => {
    expect(compareStringWithWildcard('for loop', 'for*', true)).toBe(true);
    expect(compareStringWithWildcard('the for loop', '*for*', true)).toBe(true);
    expect(compareStringWithWildcard('forloop', 'for*loop', true)).toBe(true);
    expect(compareStringWithWildcard('for the loop', 'for*loop', true)).toBe(true);
  });

  it('escapes every other regex metacharacter', () => {
    expect(compareStringWithWildcard('a+b', 'a+b', true)).toBe(true);
    expect(compareStringWithWildcard('aab', 'a+b', true)).toBe(false);
    expect(compareStringWithWildcard('3.14', '3.14', true)).toBe(true);
    expect(compareStringWithWildcard('3x14', '3.14', true)).toBe(false);
    expect(compareStringWithWildcard('a(b)c', 'a(b)c', true)).toBe(true);
    expect(compareStringWithWildcard('x^2', 'x^2', true)).toBe(true);
    expect(compareStringWithWildcard('a|b', 'a|b', true)).toBe(true);
    expect(compareStringWithWildcard('[i]', '[i]', true)).toBe(true);
  });

  it('honours an escaped asterisk as a literal asterisk', () => {
    expect(compareStringWithWildcard('2*3', String.raw`2\*3`, true)).toBe(true);
    expect(compareStringWithWildcard('2xxx3', String.raw`2\*3`, true)).toBe(false);
  });

  it('respects the case-sensitivity flag', () => {
    expect(compareStringWithWildcard('FOR', 'for', true)).toBe(true);
    expect(compareStringWithWildcard('FOR', 'for', false)).toBe(false);
  });

  it('trims the student response but not the pattern', () => {
    expect(compareStringWithWildcard('  for  ', 'for', true)).toBe(true);
  });

  it('NFC-normalises both sides so a decomposed Arabic answer still matches', () => {
    // Built from explicit code points, not pasted glyphs — a literal أ typed
    // through an editor/terminal is easily silently re-normalised to one form
    // or the other, which would make this test pass (or fail) for the wrong
    // reason. أحمد, PRECOMPOSED: أ is U+0623 (ALEF WITH HAMZA ABOVE) followed
    // by ح م د. أحمد, DECOMPOSED: the same grapheme أ written as ا (U+0627,
    // plain ALEF) followed by the combining hamza above (U+0654), then ح م د.
    const composed = 'أحمد';
    const decomposed = 'أحمد';
    expect(composed).not.toBe(decomposed);
    expect(composed.normalize('NFC')).toBe(decomposed.normalize('NFC'));
    expect(compareStringWithWildcard(decomposed, composed, true)).toBe(true);
    expect(compareStringWithWildcard(composed, decomposed, true)).toBe(true);
  });

  it('matches Arabic answers with a wildcard', () => {
    expect(compareStringWithWildcard('الحلقة التكرارية', 'الحلقة*', true)).toBe(true);
  });

  it('does not let a pattern escape into a catastrophic regex', () => {
    // A pattern of nothing but asterisks collapses to /^.*.*.*$/ — linear, not
    // exponential, because the bits between them are empty literals.
    const started = Date.now();
    expect(compareStringWithWildcard('a'.repeat(5000), '***', true)).toBe(true);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('returns false rather than throwing on an unmatchable pattern', () => {
    expect(compareStringWithWildcard('x', '', true)).toBe(false);
  });

  // ── What NFC normalisation does and does NOT do for Arabic ──────────────
  // NFC only recomposes a DECOMPOSED sequence (base letter + combining mark)
  // back into its precomposed codepoint when one exists — it never merges
  // two already-distinct letters into each other. أ/إ/آ, ة/ه and ى/ي are each
  // pairs of genuinely different letters (different meaning, different
  // precomposed codepoints), not decomposition variants of one another, so
  // the ported Moodle algorithm — NFC plus nothing else — correctly leaves
  // them distinct. A matcher that silently unified them would mark a
  // genuinely wrong spelling correct, which is a worse bug than the one this
  // task exists to fix. An instructor who wants both spellings accepted adds
  // a second answerPattern, or uses a wildcard. Every literal below is built
  // from explicit code points for the same reason as the test above: pasted
  // Arabic glyphs are too easy for a tool to silently re-normalise.
  describe('Arabic letter variants are NOT unified — only NFC composition/decomposition is', () => {
    // ALEF WITH HAMZA ABOVE / BELOW / MADDA — three distinct letters.
    const ALEF_HAMZA_ABOVE = 'أ'; // أ
    const ALEF_HAMZA_BELOW = 'إ'; // إ
    const ALEF_MADDA = 'آ'; // آ
    const HHMD = 'حمد'; // حمد

    it('أ, إ and آ are distinct letters and do not match each other', () => {
      expect(compareStringWithWildcard(ALEF_HAMZA_ABOVE + HHMD, ALEF_HAMZA_BELOW + HHMD, true)).toBe(
        false,
      );
      expect(compareStringWithWildcard(ALEF_HAMZA_ABOVE + HHMD, ALEF_MADDA + HHMD, true)).toBe(false);
      expect(compareStringWithWildcard(ALEF_HAMZA_BELOW + HHMD, ALEF_MADDA + HHMD, true)).toBe(false);
    });

    // مدرسة (ta marbuta, U+0629) vs مدرسه (ha, U+0647).
    const MADRASA_TA_MARBUTA = 'مدرسة';
    const MADRASA_HA = 'مدرسه';

    it('ة (ta marbuta) and ه (ha) are distinct letters and do not match each other', () => {
      expect(compareStringWithWildcard(MADRASA_TA_MARBUTA, MADRASA_HA, true)).toBe(false);
    });

    // على (alef maksura, U+0649) vs علي (ya, U+064A).
    const ALA_ALEF_MAKSURA = 'على';
    const ALA_YA = 'علي';

    it('ى (alef maksura) and ي (ya) are distinct letters and do not match each other', () => {
      expect(compareStringWithWildcard(ALA_ALEF_MAKSURA, ALA_YA, true)).toBe(false);
    });

    // كتب plus fatha diacritics (U+064E) after every letter, vs bare كتب.
    const KATABA_WITH_TASHKEEL = 'كَتَبَ';
    const KATABA_BARE = 'كتب';

    it('tashkeel is not stripped — a diacritic changes the string, not just its rendering', () => {
      expect(compareStringWithWildcard(KATABA_WITH_TASHKEEL, KATABA_BARE, true)).toBe(false);
    });

    it('an instructor can still accept every spelling explicitly, with a wildcard', () => {
      const MADRASA_STEM = 'مدرس'; // مدرس, no final letter
      expect(compareStringWithWildcard(MADRASA_TA_MARBUTA, `${MADRASA_STEM}*`, true)).toBe(true);
      expect(compareStringWithWildcard(MADRASA_HA, `${MADRASA_STEM}*`, true)).toBe(true);
    });
  });
});
