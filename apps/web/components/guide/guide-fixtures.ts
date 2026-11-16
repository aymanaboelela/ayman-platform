import type { CatalogCourse, CatalogCourseDetail } from '@ayman/contracts/catalog';

/**
 * Catalogue payloads for the guide's tests — the shape the API publishes, with
 * only the fields a case cares about spelled out at the call site.
 *
 * Not a `.test.` file (it holds no cases) and not imported by anything that
 * ships; `guide-*.test.ts(x)` are its only readers.
 */

let serial = 0;

export function course(overrides: Partial<CatalogCourse> = {}): CatalogCourse {
  serial += 1;
  const id = `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`;
  return {
    contentComplete: false,
    id,
    slug: `course-${serial}`,
    title: `كورس ${serial}`,
    subtitle: null,
    systemSlug: 'bacalorya',
    systemNameAr: 'البكالوريا المصرية',
    year: 2,
    trackLabelAr: null,
    subjectNameAr: 'البرمجة',
    coverKey: null,
    lessonCount: 12,
    totalSeconds: 3600,
    forGeneral: true,
    forLanguages: true,
    emphasis: null,
    emphasisNote: null,
    monthlyPriceCents: 20000,
    monthlyOnSale: true,
    quarterlyPriceCents: null,
    yearlyPriceCents: null,
    saleMonthlyPriceCents: null,
    saleYearlyPriceCents: null,
    saleEndsAt: null,
    bookTitle: null,
    bookPriceCents: null,
    publishedAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function detail(base: CatalogCourse, overrides: Partial<CatalogCourseDetail> = {}): CatalogCourseDetail {
  return {
    ...base,
    description: null,
    terms: [],
    months: [],
    sections: [],
    comingSoonNote: null,
    ...overrides,
  };
}

export const MONTH_OCT = {
  id: '11111111-1111-4111-8111-111111111111',
  monthIndex: 1,
  title: 'شهر أكتوبر',
  lessonCount: 8,
  priceCents: 20000,
};

export const MONTH_NOV = {
  id: '22222222-2222-4222-8222-222222222222',
  monthIndex: 2,
  title: 'شهر نوفمبر',
  lessonCount: 6,
  priceCents: 20000,
};

export const TERM_ONE = {
  id: '33333333-3333-4333-8333-333333333333',
  title: 'الترم الأول',
  priceCents: 70000,
};

export const TERM_TWO = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'الترم الثاني',
  priceCents: 75000,
};

export const labelOf = (row: { systemSlug: string; year: number }) => `${row.systemSlug} ${row.year}`;

/**
 * The live catalogue as it stood on 2026-11-16, in the shape the PUBLIC API
 * publishes it — which is what the guide reads, and is narrower than what the
 * admin sees:
 *
 *   · four courses, exactly one per (year, stream);
 *   · year 2: «شهر» 150, «الترم الاول» 450, «السنة كلها» 950 — and the Arabic
 *     course also has a «الترم التاني» that is created, closed and unpriced;
 *   · year 1: «شهر» 100, «الترم الاول» 350, «السنة كلها» 650;
 *   · ten months per course, the first three open.
 *
 * The public payload carries only OPEN months, and only terms that are on
 * sale in `terms`; the closed second term arrives by name in `upcomingTerms`.
 * The seven closed months are not in it at all.
 */
const MONTH_NAMES = ['الأول', 'الثاني', 'الثالث'];

function productionCourse(year: 1 | 2, stream: 'general' | 'languages'): CatalogCourseDetail {
  const base = course({
    slug: `y${year}-${stream}`,
    title: `برمجة الصف ${year === 1 ? 'الأول' : 'الثاني'} — ${stream === 'general' ? 'عربي' : 'لغات'}`,
    year,
    forGeneral: stream === 'general',
    forLanguages: stream === 'languages',
    monthlyPriceCents: year === 1 ? 10000 : 15000,
    yearlyPriceCents: year === 1 ? 65000 : 95000,
    lessonCount: 24,
  });
  const termIndex = year * 10 + (stream === 'general' ? 1 : 2);
  return detail(base, {
    terms: [
      {
        id: `aaaaaaaa-0000-4000-8000-0000000000${termIndex}`,
        title: 'الترم الاول',
        priceCents: year === 1 ? 35000 : 45000,
      },
    ],
    upcomingTerms:
      year === 2 && stream === 'general'
        ? [{ id: 'bbbbbbbb-0000-4000-8000-000000000021', title: 'الترم التاني' }]
        : [],
    months: MONTH_NAMES.map((name, index) => ({
      id: `cccccccc-0000-4000-8000-0000000${termIndex}0${index + 1}`,
      monthIndex: index + 1,
      title: `الشهر ${name}`,
      lessonCount: 8,
      priceCents: base.monthlyPriceCents!,
    })),
  });
}

export function productionCatalog() {
  const details = [
    productionCourse(1, 'general'),
    productionCourse(1, 'languages'),
    productionCourse(2, 'general'),
    productionCourse(2, 'languages'),
  ];
  return {
    /** What `GET /api/catalog/courses` lists. */
    courses: details as CatalogCourse[],
    /** What `GET /api/catalog/courses/:slug` answers, by slug. */
    details: Object.fromEntries(details.map((row) => [row.slug, row])),
  };
}
