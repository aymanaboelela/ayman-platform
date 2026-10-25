/**
 * The grades a stack teaches — `TENANT_GRADES`, the third switch beside
 * `TENANT_KEY` and `TENANT_SUBJECT`.
 *
 * ## Why a list of grades and not "the systems this stack offers"
 *
 * Every stack before this one taught secondary school, so the taxonomy only
 * ever had to answer "which system, which year": البكالوريا or الثانوية
 * العامة, years one to three. An Arabic teacher who teaches الإعدادية and
 * الصف الأول الثانوي does not fit that question at all. Their student is in
 * one of four grades, and asking them a system first («المرحلة الإعدادية»,
 * «الثانوية العامة», «البكالوريا») and a year second makes them assemble an
 * answer they already know as one phrase — «تالتة إعدادي».
 *
 * So the stack names its grades, each one a `(system, year)` the taxonomy
 * already understands, and the student picks one card. Nothing downstream
 * learns a new concept: a profile still stores a `systemId` and a `year`, a
 * course still carries the same pair, and `/library` still matches on them.
 *
 * ## Unset means the old questions
 *
 * Empty — every stack before this one, his included — is `[]`, and every
 * reader treats `[]` as "ask what you always asked". Ayman's stack ignores
 * the variable entirely (`apps/api/src/common/tenant.ts` / the web's
 * `lib/tenant-grades.ts`), for the reason `TEACHES_CODE` gives.
 *
 * ## الصف الأول الثانوي is `thanaweya_amma` year 1
 *
 * Year 1 is the common year in both secondary systems — the seed gives them
 * the same offerings, with no track — so either system would file the student
 * correctly. الثانوية العامة's label is the one the student says out loud
 * («الصف الأول الثانوي», not «الصف الأول بكالوريا»), and one fixed choice
 * means the teacher's year-1 courses and their students' profiles always land
 * on the same pair.
 *
 * `scripts/check-tenant-env.mjs` keeps its own copy of the SLUGS, for the
 * reason `subjects.ts` gives; `check-tenant-env.spec.ts` fails if they drift.
 */
export const GRADES = [
  { slug: 'prep1', system: 'preparatory', year: 1, labelAr: 'الصف الأول الإعدادي' },
  { slug: 'prep2', system: 'preparatory', year: 2, labelAr: 'الصف الثاني الإعدادي' },
  { slug: 'prep3', system: 'preparatory', year: 3, labelAr: 'الصف الثالث الإعدادي' },
  { slug: 'sec1', system: 'thanaweya_amma', year: 1, labelAr: 'الصف الأول الثانوي' },
  { slug: 'sec2', system: 'thanaweya_amma', year: 2, labelAr: 'الصف الثاني الثانوي' },
  { slug: 'sec3', system: 'thanaweya_amma', year: 3, labelAr: 'الصف الثالث الثانوي' },
  { slug: 'bac1', system: 'bacalorya', year: 1, labelAr: 'الصف الأول بكالوريا' },
  { slug: 'bac2', system: 'bacalorya', year: 2, labelAr: 'الصف الثاني بكالوريا' },
  { slug: 'bac3', system: 'bacalorya', year: 3, labelAr: 'الصف الثالث بكالوريا' },
] as const;

export type Grade = (typeof GRADES)[number];
export type GradeSlug = Grade['slug'];

/** The preparatory stage's system slug — seeded only on a stack that teaches it. */
export const PREPARATORY_SYSTEM = {
  slug: 'preparatory',
  nameAr: 'المرحلة الإعدادية',
} as const;

/**
 * `TENANT_GRADES` → the grades, in the order the env lists them (that is the
 * order the student sees). Unknown and repeated slugs are dropped rather than
 * failing a boot over them; the preflight is where a typo is refused.
 */
export function parseTenantGrades(raw: string | undefined): Grade[] {
  const out: Grade[] = [];
  for (const part of (raw ?? '').split(',')) {
    const grade = GRADES.find((g) => g.slug === part.trim());
    if (grade && !out.includes(grade)) out.push(grade);
  }
  return out;
}

/** The grade a stored `(system, year)` pair is, among the stack's own. */
export function gradeOf(
  grades: readonly Grade[],
  system: string | undefined,
  year: number | null | undefined,
): Grade | undefined {
  return grades.find((g) => g.system === system && g.year === year);
}

/**
 * The words `copy/subject.ts`'s `{stage}` holes are filled with — what the
 * stack calls the school stage it teaches.
 *
 * The default (no grades, or secondary only) is exactly the literal those
 * templates carried before the holes existed, so every stack that sets no
 * `TENANT_GRADES` renders byte-identically. Nominative-free spellings on
 * purpose: «الإعدادي والثانوي» reads correctly after «لطلبة», after «—» and
 * with «لل» in front, where «المرحلتين» would be wrong in two of the three.
 */
export interface StageWords {
  /** «المرحلة الثانوية» — after «لطلبة» or «—». */
  stage: string;
  /** «للمرحلة الثانوية». */
  forStage: string;
  /** «ثانوي» — the short spoken form a search query uses. */
  stageShort: string;
  /** «للثانوية» — the short form with its preposition. */
  forStageShort: string;
  /** «أول ثانوي» — where the stack's grades start. */
  firstGrade: string;
  /** «أولى وتانية وتالتة ثانوي» — the grades, as a student types them. */
  gradesSpoken: string;
}

const SECONDARY_WORDS: StageWords = {
  stage: 'المرحلة الثانوية',
  forStage: 'للمرحلة الثانوية',
  stageShort: 'ثانوي',
  forStageShort: 'للثانوية',
  firstGrade: 'أول ثانوي',
  gradesSpoken: 'أولى وتانية وتالتة ثانوي',
};

const SPOKEN_YEAR = ['أولى', 'تانية', 'تالتة'] as const;

function spokenYears(years: readonly number[], stage: string): string {
  const words = years.map((y) => SPOKEN_YEAR[y - 1]);
  if (words.length <= 1) return `${words[0] ?? ''} ${stage}`.trim();
  return `${words.slice(0, -1).join(' و')} و${words[words.length - 1]} ${stage}`;
}

export function stageWords(grades: readonly Grade[]): StageWords {
  const prep = grades.filter((g) => g.system === PREPARATORY_SYSTEM.slug).map((g) => g.year);
  const sec = grades.filter((g) => g.system !== PREPARATORY_SYSTEM.slug).map((g) => g.year);
  if (prep.length === 0) return SECONDARY_WORDS;
  const prepSpoken = prep.length === 3 ? 'إعدادي' : spokenYears(prep, 'إعدادي');
  if (sec.length === 0) {
    return {
      stage: 'المرحلة الإعدادية',
      forStage: 'للمرحلة الإعدادية',
      stageShort: 'إعدادي',
      forStageShort: 'للإعدادية',
      firstGrade: `${SPOKEN_YEAR[Math.min(...prep) - 1]} إعدادي`,
      gradesSpoken: prepSpoken,
    };
  }
  return {
    stage: 'الإعدادي والثانوي',
    forStage: 'للإعدادي والثانوي',
    stageShort: 'إعدادي وثانوي',
    forStageShort: 'لإعدادي وثانوي',
    firstGrade: `${SPOKEN_YEAR[Math.min(...prep) - 1]} إعدادي`,
    gradesSpoken: `${prepSpoken} و${spokenYears([...new Set(sec)].sort(), 'ثانوي')}`,
  };
}
