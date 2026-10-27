/**
 * The one place Arabic text is folded before the auto-reply bot reads it.
 *
 * ## Why folding, and why both sides
 *
 * The same question arrives spelt a dozen ways: «الكورس بكام», «الكورس بكاااام؟؟»,
 * «الكورس بكم», «الكورس بـكام», «ألكورس بكام», «el course bkam». A keyword list
 * cannot enumerate those, so instead the TEXT and the KEYWORDS go through the
 * same fold and are compared afterwards. Every rule below is applied to both,
 * which is what makes a rule like "collapse repeated letters" safe: «اللي»
 * becomes «الي» on both sides, so nothing that matched before stops matching.
 *
 * ## What is folded
 *
 *   · Arabic-Indic and Persian digits → ASCII («٣» → «3»), because «1» and
 *     «١» are the same answer to «السنة الدراسية كام؟».
 *   · diacritics (tashkeel, superscript alef) and tatweel — nobody types them
 *     on purpose in a chat, and «بـكام» is «بكام».
 *   · the alef family (أ إ آ ٱ) → ا, ى → ي, ة → ه, ؤ → و, ئ → ي, and a lone ء
 *     is dropped. These are the misspellings that are not misspellings — the
 *     keyboard and the reader treat them as one letter.
 *   · Persian/Urdu letter forms (ک گ ی) → their Arabic twin.
 *   · Latin to lowercase, so Franco-Arabic («Ezay a4tark») folds too.
 *   · any run of the SAME letter → one («بكاااام» → «بكام», «helloooo» →
 *     «helo»). Letters only: digits are values, and «100» must stay «100».
 *   · everything that is not a letter or a digit (punctuation, emoji, «؟») →
 *     one space.
 *
 * ## No imports, on purpose
 *
 * This is a leaf the API loads at runtime through a subpath export, and the
 * production loader resolves relative specifiers the Node ESM way. A module
 * with nothing to resolve cannot fail to resolve — see `copy/tenant-sentence.ts`
 * for the CI run that taught that.
 */

const ARABIC_INDIC = /[٠-٩۰-۹]/gu;
const DIACRITICS = /[ً-ٰٟۖ-ۭـ]/gu;
const NOT_WORD = /[^a-z0-9ء-ي]+/gu;
const REPEATED_LETTER = /([a-zء-ي])\1+/gu;

export function normalizeArabic(input: string): string {
  return input
    .replace(ARABIC_INDIC, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
    })
    .toLowerCase()
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ة/gu, 'ه')
    .replace(/ؤ/gu, 'و')
    .replace(/ئ/gu, 'ي')
    .replace(/ء/gu, '')
    .replace(/[کك]/gu, 'ك')
    .replace(/گ/gu, 'ك')
    .replace(/[ی]/gu, 'ي')
    .replace(NOT_WORD, ' ')
    .replace(REPEATED_LETTER, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * The proclitics Egyptian Arabic glues onto the front of a word:
 * «والكورس», «بالكتاب», «للسنة», «فالحصة». Longest first, because «وال» must
 * be tried before «و» or «والكورس» would only lose its «و».
 *
 * A token keeps its own spelling as well as every stripped form (see
 * `tokenVariants`), so stripping can only ever ADD a match — «وقت» stripped of
 * «و» is «قت», which matches nothing, while «وقت» itself still does.
 */
const PREFIXES = ['وبال', 'وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ب', 'ل', 'ف'] as const;

/** One token, plus the forms it takes once a proclitic is peeled off it. */
export function tokenVariants(token: string): string[] {
  const out = new Set<string>([token]);
  for (const prefix of PREFIXES) {
    // Two letters must survive, or «بس» becomes «س» and «لو» becomes «و».
    if (token.startsWith(prefix) && token.length - prefix.length >= 2) {
      const rest = token.slice(prefix.length);
      out.add(rest);
      // «بالكورس» → «الكورس» → «كورس»: a second peel for the article.
      if (rest.startsWith('ال') && rest.length - 2 >= 2) out.add(rest.slice(2));
    }
  }
  return [...out];
}

/** The folded text, split into tokens. */
export function tokenize(input: string): string[] {
  const folded = normalizeArabic(input);
  return folded ? folded.split(' ') : [];
}
