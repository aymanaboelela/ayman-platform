/**
 * The subjects of the Egyptian secondary curriculum — canonical slugs and
 * names, shared by the seed, the control plane and every stack's identity.
 *
 * ## Why this is in contracts and not only in the seed
 *
 * `apps/api/src/scripts/seed.ts` upserts these rows on every boot, and that
 * used to be the only copy. A stack now also has to know its OWN subject
 * before it has a database at all: `TENANT_SUBJECT` names one of these slugs,
 * the web build reads it at `next build` (when the API is unreachable by
 * construction), and the control plane offers the list in a picker. Three
 * readers, one list.
 *
 * `scripts/check-tenant-env.mjs` keeps its own copy of the SLUGS — it has to
 * run with plain `node` before anything is installed — and
 * `check-tenant-env.spec.ts` fails if the two drift.
 *
 * Names only: no grading semantics live here (that is the seed's
 * `subjectOffering` rows), and a slug here is a promise that the seed creates
 * a `subject` row with it.
 */
export const SUBJECTS = [
  { slug: 'arabic', nameAr: 'اللغة العربية' },
  { slug: 'first_foreign_language', nameAr: 'اللغة الأجنبية الأولى' },
  { slug: 'second_foreign_language', nameAr: 'اللغة الأجنبية الثانية' },
  { slug: 'egyptian_history', nameAr: 'التاريخ المصري' },
  { slug: 'mathematics', nameAr: 'الرياضيات' },
  { slug: 'integrated_science', nameAr: 'العلوم المتكاملة' },
  { slug: 'philosophy_logic', nameAr: 'الفلسفة والمنطق' },
  { slug: 'religious_education', nameAr: 'التربية الدينية' },
  { slug: 'programming_cs', nameAr: 'البرمجة وعلوم الحاسب' },
  { slug: 'physics', nameAr: 'الفيزياء' },
  { slug: 'chemistry', nameAr: 'الكيمياء' },
  { slug: 'biology', nameAr: 'الأحياء' },
  { slug: 'accounting', nameAr: 'المحاسبة' },
  { slug: 'business_administration', nameAr: 'إدارة الأعمال' },
  { slug: 'psychology', nameAr: 'علم النفس' },
  { slug: 'economics', nameAr: 'الاقتصاد' },
  { slug: 'geography', nameAr: 'الجغرافيا' },
  { slug: 'statistics', nameAr: 'الإحصاء' },
] as const;

export type SubjectSlug = (typeof SUBJECTS)[number]['slug'];

/**
 * What an unset `TENANT_SUBJECT` means: programming, which is what every
 * stack taught before the variable existed — Ayman's, and the first two
 * instructors' (both programming teachers). Silence keeps them byte-identical.
 */
export const DEFAULT_TENANT_SUBJECT: SubjectSlug = 'programming_cs';

export function isSubjectSlug(value: string): value is SubjectSlug {
  return SUBJECTS.some((subject) => subject.slug === value);
}

/** The subject's Arabic name; the default subject's for anything unknown. */
export function subjectNameAr(slug: string): string {
  return (
    SUBJECTS.find((subject) => subject.slug === slug)?.nameAr ??
    SUBJECTS.find((subject) => subject.slug === DEFAULT_TENANT_SUBJECT)!.nameAr
  );
}
