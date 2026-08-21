import type { CatalogCourse } from '@ayman/contracts';

/**
 * Stand-in courses, shown ONLY when the real catalogue comes back empty.
 *
 * ## Why this exists
 *
 * A fresh checkout has no database, so every catalogue-driven section renders
 * nothing and the landing page cannot be looked at or designed against. These
 * fill that gap the same way `<MediaSlot>`'s fallbacks fill a missing
 * photograph: the page ships finished and IMPROVES when the real content lands,
 * rather than changing shape.
 *
 * ## The rules that keep this honest
 *
 * 1. **Only ever a fallback.** One `courses.length === 0` check decides, in
 *    `<InstructorProfile>`. The instant the API returns a single real course,
 *    none of this is reachable.
 * 2. **Only the profile section.** `<FeaturedCourses>` and `/courses`
 *    deliberately show nothing when there is nothing — on those, "no courses"
 *    is a true answer worth seeing. Here the grid is the section's
 *    illustration, not its claim.
 * 3. **The slugs do not resolve, and that is correct.** They point at
 *    `/courses/<slug>` pages that will 404. Inventing slugs that happen to
 *    match real ones later would be worse: a demo tile that silently starts
 *    linking somewhere real is a bug nobody would think to look for.
 *
 * Delete this file the day the catalogue is always seeded. Nothing else needs
 * to change.
 */
export const DEMO_COURSES: CatalogCourse[] = [
  {
    id: 'demo-1',
    slug: 'demo-programming-foundations',
    title: 'الكورس التأسيسي في البرمجة',
    subtitle: 'من الصفر — من غير أي خلفية سابقة',
    systemSlug: 'bacc',
    systemNameAr: 'البكالوريا المصرية',
    year: 1,
    trackLabelAr: 'تمهيدي',
    subjectNameAr: 'البرمجة وعلوم الحاسب',
    coverKey: null,
    lessonCount: 12,
    totalSeconds: 4 * 3600,
    forGeneral: true,
    forLanguages: false,
    emphasis: null,
    emphasisNote: null,
    publishedAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'demo-2',
    slug: 'demo-year-1-basics',
    title: 'أساسيات البرمجة — الصف الأول',
    subtitle: 'المتغيرات والشروط والتكرار',
    systemSlug: 'bacc',
    systemNameAr: 'البكالوريا المصرية',
    year: 1,
    trackLabelAr: 'الصف الأول',
    subjectNameAr: 'البرمجة وعلوم الحاسب',
    coverKey: null,
    lessonCount: 18,
    totalSeconds: 6 * 3600,
    forGeneral: true,
    forLanguages: true,
    emphasis: null,
    emphasisNote: null,
    publishedAt: '2026-01-12T00:00:00.000Z',
    updatedAt: '2026-01-12T00:00:00.000Z',
  },
  {
    id: 'demo-3',
    slug: 'demo-year-1-problem-solving',
    title: 'حل المسائل بالخوارزميات',
    subtitle: 'تفكير قبل أول سطر',
    systemSlug: 'bacc',
    systemNameAr: 'البكالوريا المصرية',
    year: 1,
    trackLabelAr: 'الصف الأول',
    subjectNameAr: 'البرمجة وعلوم الحاسب',
    coverKey: null,
    lessonCount: 9,
    totalSeconds: 3 * 3600,
    forGeneral: false,
    forLanguages: true,
    emphasis: null,
    emphasisNote: null,
    publishedAt: '2026-02-02T00:00:00.000Z',
    updatedAt: '2026-02-02T00:00:00.000Z',
  },
  {
    id: 'demo-4',
    slug: 'demo-year-2-functions',
    title: 'الدوال والتراكيب — الصف الثاني',
    subtitle: 'كود ينفع يتعاد استخدامه',
    systemSlug: 'bacc',
    systemNameAr: 'البكالوريا المصرية',
    year: 2,
    trackLabelAr: 'الصف الثاني',
    subjectNameAr: 'البرمجة وعلوم الحاسب',
    coverKey: null,
    lessonCount: 21,
    totalSeconds: 7 * 3600,
    forGeneral: true,
    forLanguages: true,
    emphasis: null,
    emphasisNote: null,
    publishedAt: '2026-02-18T00:00:00.000Z',
    updatedAt: '2026-02-18T00:00:00.000Z',
  },
  {
    id: 'demo-5',
    slug: 'demo-year-2-data',
    title: 'هياكل البيانات للمبتدئين',
    subtitle: 'القوائم والقواميس وإمتى تستخدم إيه',
    systemSlug: 'bacc',
    systemNameAr: 'البكالوريا المصرية',
    year: 2,
    trackLabelAr: 'الصف الثاني',
    subjectNameAr: 'البرمجة وعلوم الحاسب',
    coverKey: null,
    lessonCount: 15,
    totalSeconds: 5 * 3600,
    forGeneral: true,
    forLanguages: false,
    emphasis: null,
    emphasisNote: null,
    publishedAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 'demo-6',
    slug: 'demo-exam-prep',
    title: 'مراجعة نهائية وحل امتحانات',
    subtitle: 'كل نماذج الامتحانات محلولة خطوة بخطوة',
    systemSlug: 'bacc',
    systemNameAr: 'البكالوريا المصرية',
    year: 2,
    trackLabelAr: 'الصف الثاني',
    subjectNameAr: 'البرمجة وعلوم الحاسب',
    coverKey: null,
    lessonCount: 10,
    totalSeconds: 4 * 3600,
    forGeneral: false,
    forLanguages: true,
    emphasis: null,
    emphasisNote: null,
    publishedAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  },
];
