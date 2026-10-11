import type { PrismaService } from '../../prisma/prisma.service';

/**
 * «التحديات» من كتاب خارجي — درس الكتاب رقم N بيتربط بمحاضرة الكورس رقم N.
 *
 * ليه بالترتيب ومش بالاسم: أسماء الدروس على المنصة بيكتبها المدرّس زي ما
 * يحب («الدرس الاول»، «الدرس الثالث») ومافيهاش اسم الموضوع، وتقسيمه للوحدات
 * مش لازم يطابق الكتاب — أولى بكالوريا «الوحدة الأولى · الدرس الثالث» عنده
 * هو «الوحدة ٢ · الدرس ١» في كتاب الوزارة. اللي ثابت هو الترتيب: بيشرح
 * المنهج بنفس تسلسل الكتاب. فالعدّ على الكورس كله، مش جوه كل وحدة.
 *
 * بيتحسب وقت ما التحديات بتتحسب، مش بيتخزّن — محاضرة تتضاف بكرة بتلاقي
 * أسئلتها على طول، وإعادة ترتيب الكورس بتمشي معاها.
 *
 * المحاضرة = درس فيديو، مش في قسم امتحانات/حلول، واسمه مش «حل تقييم» ولا
 * «مراجعة» ولا «Solve the Assessments». فيديو من دول وسط الوحدة كان هيزق كل
 * اللي بعده درس لقدّام — وده بالظبط اللي حصل في كورس تانية لغات.
 */

/** كلمات بتقول إن الفيديو مش شرح درس جديد. `حل` لوحدها كلمة كاملة — «تحليل» و«مرحلة» فيهم «حل». */
const NOT_A_LECTURE: readonly RegExp[] = [
  /(^|\s)حل(\s|$)/u,
  /(^|\s)(و?ال)?(تقي?يم|مراجع|امتحان|واجب|كويز|اختبار)/u,
  /\b(solve|solving|solutions?|assessments?|review|revision|exams?|homework|quiz(zes)?|tests?)\b/iu,
];

function namesSomethingElse(text: string): boolean {
  return NOT_A_LECTURE.some((pattern) => pattern.test(text));
}

export interface CourseLessonRow {
  courseId: string;
  lessonId: string;
  title: string;
  kind: string;
  sectionTitle: string;
}

export function isLecture(row: CourseLessonRow): boolean {
  return row.kind === 'video' && !namesSomethingElse(row.sectionTitle) && !namesSomethingElse(row.title);
}

export interface BookLessonRow {
  courseId: string;
  /** تصنيف درس الكتاب. */
  categoryId: string;
}

export interface BookLessonLink {
  categoryId: string;
  courseId: string;
  lessonId: string;
}

/**
 * @param lessons دروس الكورسات بترتيب الكورس (القسم ثم الدرس).
 * @param bookLessons دروس كل كتاب بترتيب الكتاب (الوحدة ثم الدرس)، كتاب ورا كتاب —
 *   كتابين على نفس الكورس كل واحد بيبدأ عدّه من الأول.
 */
export function bookLessonLinks(
  lessons: readonly CourseLessonRow[],
  books: readonly (readonly BookLessonRow[])[],
): BookLessonLink[] {
  const lectures = new Map<string, string[]>();
  for (const row of lessons) {
    if (!isLecture(row)) continue;
    const list = lectures.get(row.courseId) ?? [];
    list.push(row.lessonId);
    lectures.set(row.courseId, list);
  }
  const links: BookLessonLink[] = [];
  for (const book of books) {
    book.forEach((lesson, index) => {
      const lessonId = lectures.get(lesson.courseId)?.[index];
      if (lessonId) links.push({ categoryId: lesson.categoryId, courseId: lesson.courseId, lessonId });
    });
  }
  return links;
}

/** نفس الربط من الداتابيز — للكتب اللي مش متأرشفة بس. */
export async function loadBookLessonLinks(
  prisma: PrismaService,
  courseIds: readonly string[],
): Promise<BookLessonLink[]> {
  if (courseIds.length === 0) return [];
  const books = await prisma.externalBook.findMany({
    where: { courseId: { in: [...courseIds] }, archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      courseId: true,
      rootCategory: {
        select: {
          children: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            select: {
              children: {
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
  const withCourse = books.filter((book) => book.courseId !== null && book.rootCategory !== null);
  if (withCourse.length === 0) return [];

  const lessons = await prisma.lesson.findMany({
    where: { courseId: { in: [...new Set(withCourse.map((book) => book.courseId!))] } },
    orderBy: [{ section: { position: 'asc' } }, { position: 'asc' }, { id: 'asc' }],
    select: { id: true, courseId: true, title: true, kind: true, section: { select: { title: true } } },
  });

  return bookLessonLinks(
    lessons.map((lesson) => ({
      courseId: lesson.courseId,
      lessonId: lesson.id,
      title: lesson.title,
      kind: lesson.kind,
      sectionTitle: lesson.section.title,
    })),
    withCourse.map((book) =>
      book.rootCategory!.children.flatMap((unit) =>
        unit.children.map((lesson) => ({ courseId: book.courseId!, categoryId: lesson.id })),
      ),
    ),
  );
}
