/**
 * The hue and the glyph a course wears when it has no uploaded cover.
 *
 * ## Why generated art exists at all
 *
 * Almost no course has a cover. `courses.cover_key` was a column with no admin
 * control behind it until 2026-08-07, so every course on production was
 * published without one — and the coverless fallback everywhere was
 * `.course-thumb`: a grey panel, a hatch, and a small book icon. Four enrolled
 * courses therefore rendered as four identical grey rectangles taking up half
 * the dashboard, which is most of why the signed-in surface was described as
 * «مصمطة … مافيش روح».
 *
 * The answer is not "wait for uploads". It is to make the coverless case
 * genuinely designed: a deterministic piece of art per SUBJECT, so a shelf of
 * courses reads like a shelf of book jackets rather than like a grid of failed
 * images. An uploaded cover still wins whenever there is one.
 *
 * ## Why keyed on the subject, and why by NAME
 *
 * The hue has to be stable across every screen a course appears on — the
 * dashboard, the library, the public catalog, the player rail — or the same
 * course changes colour as a student walks through the product. The subject is
 * the only identifier all four payloads carry: `subjectNameAr` is on
 * `EnrolledCourse`, on `CatalogCourse` and on `LibraryCourse`, while the
 * subject's `slug` and `id` are on none of them. Keying on the id would mean
 * widening three contracts to paint a background.
 *
 * A name is a weaker key than an id — rename «الفيزياء» in the taxonomy and its
 * courses change colour once — and that is an acceptable price for a
 * decorative property. `hashHue` catches everything the table misses, so a
 * subject added tomorrow still gets a stable colour rather than a default grey.
 *
 * ## The colour rule this deliberately steps outside
 *
 * `study.css` reserves ember for structure, amber for action, and green/red for
 * the quiz's verdict — so that a student learns exactly one thing: orange is
 * what you press. These hues are none of those, and the rule that keeps them
 * from eroding that is a rule about WHERE, not about how many:
 *
 *   A decorative hue may only ever fill a NON-INTERACTIVE CATEGORY MARK — the
 *   artwork behind a course (`.course-art`) and the icon well on a statistic
 *   (`.tile--hued`). Never a border, never text, never a chip, never a button,
 *   never a status.
 *
 * Both surfaces are things you look at and cannot press, and neither carries a
 * verdict, so neither can teach a student that teal means anything except
 * "chemistry" — for the same reason a shelf of coloured spines does not make a
 * reader think the spines are buttons.
 *
 * Hues are spaced around the wheel so no two subjects a student is likely to
 * hold at once collide, and every one is rendered at the same lightness and
 * chroma (see `.course-art` in `globals.css`), so a grid of them reads as one
 * set lit the same way rather than as a paintbox.
 */

/** The glyph key. Resolved to a `lucide-react` component in `course-art.tsx` —
 *  this module stays free of React so it can be unit-tested on its own. */
export type SubjectGlyph =
  | 'sigma'
  | 'atom'
  | 'flask'
  | 'leaf'
  | 'braces'
  | 'pen'
  | 'languages'
  | 'landmark'
  | 'globe'
  | 'brain'
  | 'moon'
  | 'microscope'
  | 'calculator'
  | 'briefcase'
  | 'heart'
  | 'trending'
  | 'chart'
  | 'book';

export interface SubjectArt {
  /** OKLCH hue angle, 0–360. */
  hue: number;
  glyph: SubjectGlyph;
}

/**
 * Every subject the taxonomy ships with, keyed on the exact `nameAr` the API
 * sends. Order is not significant; the hues are chosen to be far apart, not
 * sequential, because the subjects a single student holds are neighbours in
 * this list (a science student takes physics, chemistry and biology together).
 */
const TABLE: Record<string, SubjectArt> = {
  'الرياضيات': { hue: 265, glyph: 'sigma' },
  'الفيزياء': { hue: 225, glyph: 'atom' },
  'الكيمياء': { hue: 190, glyph: 'flask' },
  'الأحياء': { hue: 160, glyph: 'leaf' },
  'البرمجة وعلوم الحاسب': { hue: 300, glyph: 'braces' },
  'اللغة العربية': { hue: 30, glyph: 'pen' },
  'اللغة الأجنبية الأولى': { hue: 245, glyph: 'languages' },
  'اللغة الأجنبية الثانية': { hue: 330, glyph: 'languages' },
  'التاريخ المصري': { hue: 55, glyph: 'landmark' },
  'الجغرافيا': { hue: 135, glyph: 'globe' },
  'الفلسفة والمنطق': { hue: 280, glyph: 'brain' },
  'التربية الدينية': { hue: 100, glyph: 'moon' },
  'العلوم المتكاملة': { hue: 175, glyph: 'microscope' },
  'المحاسبة': { hue: 85, glyph: 'calculator' },
  'إدارة الأعمال': { hue: 20, glyph: 'briefcase' },
  'علم النفس': { hue: 310, glyph: 'heart' },
  'الاقتصاد': { hue: 45, glyph: 'trending' },
  'الإحصاء': { hue: 205, glyph: 'chart' },
};

/**
 * FNV-1a. Chosen over `reduce((a, c) => a + c.charCodeAt(0))` because a plain
 * character sum collides on anagrams, and Arabic subject names differ from each
 * other by a letter or two far more often than English ones do — «الجغرافيا»
 * and «الفلسفة» must not land on the same hue.
 *
 * `Math.imul` keeps the multiply in 32-bit, which is what makes this produce
 * the same number in Node and in the browser rather than drifting once the
 * float loses precision.
 */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A hue for a subject the table does not know, on a 24-step wheel rather than
 * on all 360: two unknown subjects 3° apart are the same colour to a reader and
 * only look like a bug. 15° steps are the smallest difference that still reads
 * as a different colour at this chroma.
 */
function hashHue(value: string): number {
  return (hashString(value) % 24) * 15;
}

export function subjectArt(subjectNameAr: string): SubjectArt {
  const known = TABLE[subjectNameAr.trim()];
  if (known) return known;
  return { hue: hashHue(subjectNameAr), glyph: 'book' };
}

/**
 * Which of the three shape layouts a piece of art uses.
 *
 * Seeded on the COURSE rather than on the subject, so two courses in the same
 * subject sit side by side in the library without looking like the same image
 * printed twice — they share a hue, which is the point, and differ in
 * composition, which is what stops the shelf reading as a duplicate.
 */
export function artVariant(seed: string): 0 | 1 | 2 {
  return (hashString(seed) % 3) as 0 | 1 | 2;
}
