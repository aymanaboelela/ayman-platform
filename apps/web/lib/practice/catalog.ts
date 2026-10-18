import { PRACTICE_SETS } from './sets';

/**
 * «اختبارات مجانية» — which lessons have a public self-test, and where each one
 * sends the student next.
 *
 * ## Why the questions are files in the repo, not rows in the question bank
 *
 * The bank is the paid product: every quiz route reads it behind a session,
 * and `graderInfo` / option fractions must never reach a learner who has not
 * submitted. A public page that served bank rows would need a new anonymous
 * API surface, an authz-matrix row, a throttle and a grader that can never
 * leak a key — for questions whose whole point is to be given away. As static
 * data the page prerenders, costs the API nothing, and every lesson's quiz is
 * an indexable URL («اختبار على درس … أونلاين»), which is half of why it
 * exists.
 *
 * The cost is honest: the answer key is in the page. That is fine for a
 * self-test with no score anyone else sees, and it is the reason nothing here
 * is ever written back to a student's record.
 *
 * ⚠️ Ayman only. The sets are HIS curriculum (both years of «البرمجة والذكاء
 * الاصطناعي»), the explanations are his, and every CTA points at his courses.
 * The routes 404 on any other stack, the footer row and the sitemap entries
 * are gated the same way (`IS_AYMAN`).
 */

export type PracticeYear = 1 | 2;

export interface PracticeQuestion {
  id: string;
  type: 'mcq' | 'tf';
  stem: string;
  /** Exactly four for `mcq`; absent for `tf`, whose two options are صح / غلط. */
  options?: readonly string[];
  /** Index into `options`; for `tf`, 0 = صح and 1 = غلط. */
  answer: number;
  explanation: string;
}

export interface PracticeSet {
  year: PracticeYear;
  lesson: string;
  title: string;
  questions: readonly PracticeQuestion[];
}

interface LessonEntry {
  code: string;
  /** The free «شرح درس» article for the same lesson, under `/news/`. */
  article: string;
}

interface UnitEntry {
  title: string;
  lessons: readonly LessonEntry[];
}

/** In the books' order. A lesson with no set yet is simply not listed. */
const UNITS: Record<PracticeYear, readonly UnitEntry[]> = {
  1: [
    {
      title: 'الوحدة الأولى: ما هي المعلومات؟',
      lessons: [
        { code: '1-1', article: 'شرح-درس-المعلومات-والوسائط-اولى-بكالوريا' },
        { code: '1-2', article: 'شرح-درس-اخلاقيات-المعلومات-اولى-بكالوريا' },
      ],
    },
    {
      title: 'الوحدة الثانية: القوانين والحقوق في مجتمع المعلومات',
      lessons: [
        { code: '2-1', article: 'شرح-درس-البيانات-الشخصية-اولى-بكالوريا' },
        { code: '2-2', article: 'شرح-درس-حقوق-الملكية-الفكرية-اولى-بكالوريا' },
        { code: '2-3', article: 'شرح-درس-استخدام-المعلومات-والكشف-عنها-اولى-بكالوريا' },
      ],
    },
    {
      title: 'الوحدة الثالثة: أمن المعلومات',
      lessons: [
        { code: '3-1', article: 'شرح-درس-التهديدات-والتدابير-المضادة-في-امن-المعلومات-1-اولى-بكالوريا' },
        { code: '3-2', article: 'شرح-درس-التهديدات-والتدابير-المضادة-في-امن-المعلومات-2-اولى-بكالوريا' },
        { code: '3-3', article: 'شرح-درس-التهديدات-والتدابير-المضادة-في-امن-المعلومات-3-اولى-بكالوريا' },
      ],
    },
    {
      title: 'الوحدة السادسة: تصميم المعلومات',
      lessons: [
        { code: '6-2', article: 'شرح-درس-النظام-الثنائي-وكمية-البيانات-اولى-بكالوريا' },
        { code: '6-3', article: 'شرح-درس-النظام-السادس-عشر-اولى-بكالوريا' },
        { code: '6-4', article: 'شرح-درس-التمثيل-الرقمي-للاحرف-اولى-بكالوريا' },
        { code: '6-5', article: 'شرح-درس-العمليات-الحسابية-العددية-1-اولى-بكالوريا' },
        { code: '6-6', article: 'شرح-درس-العمليات-الحسابية-العددية-2-اولى-بكالوريا' },
        { code: '6-8', article: 'شرح-درس-رقمنة-الصور-اولى-بكالوريا' },
        { code: '6-10', article: 'شرح-درس-تصميم-البيانات-اولى-بكالوريا' },
      ],
    },
  ],
  2: [
    {
      title: 'الوحدة الأولى: تكنولوجيا المعلومات والمجتمع',
      lessons: [
        { code: '1-1', article: 'شرح-درس-تطور-تكنولوجيا-المعلومات-والتحول-الاجتماعي' },
        { code: '1-2', article: 'شرح-درس-كيف-يعمل-الذكاء-الاصطناعي' },
        { code: '1-3', article: 'شرح-درس-الذكاء-الاصطناعي-في-الحياة-اليومية-والصناعة' },
        { code: '1-4', article: 'شرح-درس-القضايا-الاخلاقية-للذكاء-الاصطناعي' },
      ],
    },
    {
      title: 'الوحدة الثانية: الأمن السيبراني',
      lessons: [
        { code: '2-1', article: 'شرح-درس-تقنيات-التشفير-والمصادقة' },
        { code: '2-2', article: 'شرح-درس-تصميم-امان-الشبكات' },
        { code: '2-3', article: 'شرح-درس-الاستجابة-للحوادث-وادارة-المخاطر' },
      ],
    },
    {
      title: 'الوحدة الثالثة: الويب',
      lessons: [
        { code: '3-1', article: 'شرح-درس-البنية-العامة-لتطبيقات-الويب' },
        { code: '3-2', article: 'شرح-درس-طرق-اتصال-تطبيقات-الويب' },
        { code: '3-3', article: 'شرح-درس-اساسيات-تقنية-الواجهة-الامامية' },
      ],
    },
    {
      title: 'الوحدة الرابعة: تصميم الويب والوسائط',
      lessons: [
        { code: '4-1', article: 'شرح-درس-انواع-الوسائط-وخصائصها' },
        { code: '4-2', article: 'شرح-درس-تصميم-المعلومات-وتجربة-المستخدم' },
        { code: '4-3', article: 'شرح-درس-طرق-تقييم-المواقع-الالكترونية' },
        { code: '4-4', article: 'شرح-درس-عملية-التحسين-التكراري-للمواقع' },
      ],
    },
  ],
};

/** The Arabic-track course each year's CTA opens. */
export const PRACTICE_COURSE: Record<PracticeYear, string> = {
  1: 'programming-cs-year1-2027-general',
  2: 'programming-cs-year2-2027-general',
};

export const PRACTICE_YEARS: readonly PracticeYear[] = [2, 1];

export function practicePath(year: PracticeYear, code: string): string {
  return `/practice/${year}/${code}`;
}

export function parsePracticeYear(raw: string): PracticeYear | null {
  return raw === '1' ? 1 : raw === '2' ? 2 : null;
}

export function getPracticeSet(year: PracticeYear, code: string): PracticeSet | null {
  return PRACTICE_SETS.find((set) => set.year === year && set.lesson === code) ?? null;
}

export interface PracticeLessonCard {
  year: PracticeYear;
  code: string;
  title: string;
  count: number;
  article: string;
}

export interface PracticeUnit {
  title: string;
  lessons: PracticeLessonCard[];
}

/** The units of one year, each holding only the lessons that have a set. */
export function practiceUnits(year: PracticeYear): PracticeUnit[] {
  return UNITS[year]
    .map((unit) => ({
      title: unit.title,
      lessons: unit.lessons.flatMap((lesson) => {
        const set = getPracticeSet(year, lesson.code);
        return set
          ? [{ year, code: lesson.code, title: set.title, count: set.questions.length, article: lesson.article }]
          : [];
      }),
    }))
    .filter((unit) => unit.lessons.length > 0);
}

export function practiceLesson(year: PracticeYear, code: string): PracticeLessonCard | null {
  return practiceUnits(year).flatMap((unit) => unit.lessons).find((l) => l.code === code) ?? null;
}

/** Every published set, for `generateStaticParams` and the sitemap. */
export function allPracticeLessons(): PracticeLessonCard[] {
  return PRACTICE_YEARS.flatMap((year) => practiceUnits(year).flatMap((unit) => unit.lessons));
}
