import type { HonorBoard } from '@ayman/contracts/admin/exams';
import { Injectable, NotFoundException } from '@nestjs/common';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import type {
  CatalogCourseDetail,
  CatalogList,
  CatalogStreamFilter,
} from '@ayman/contracts/catalog';
import { PrismaService } from '../../prisma/prisma.service';
import { COURSE_BOOK_SELECT, courseBook } from '../books/course-book';

/**
 * "Published" is a THREE-level condition: the course, its section, and the
 * lesson each have to be published. Checking only the course is how a
 * half-finished chapter ends up on a public page.
 */
const PUBLISHED_LESSON = {
  isPublished: true,
  section: { isPublished: true },
} as const;

/**
 * `lessonCount` counts LECTURES, not rows.
 *
 * A quiz is the check that hangs off the lecture above it, not a thing a
 * student sits down to do — and counting it made a three-lecture course
 * advertise «٥ محاضرة» on the public card while the outline numbered its
 * quizzes «المحاضرة ٣» and «المحاضرة ٥». The same predicate is applied by
 * `CourseProgressService.recalculate`, so the card, the outline and the
 * percentage all describe one set.
 */
const isLecture = (lesson: { kind: string }): boolean => lesson.kind !== 'quiz';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Explicit `select`, never `include`. `include` returns every scalar on the
   * model, which means adding a column to `courses` silently adds it to the
   * public API — the exact mechanism by which internal fields leak.
   */
  /**
   * `stream` is a MEMBERSHIP test, not equality: a visitor filtering for عام
   * wants every course a عام student can take, and a course serving both is
   * one of them. `{ forGeneral: true }` says exactly that and needs no OR.
   */
  async list(stream?: CatalogStreamFilter): Promise<CatalogList> {
    const rows = await this.prisma.course.findMany({
      where: {
        status: 'published',
        ...(stream === 'general' && { forGeneral: true }),
        ...(stream === 'languages' && { forLanguages: true }),
      },
      orderBy: [{ position: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        year: true,
        coverKey: true,
        forGeneral: true,
        forLanguages: true,
        emphasis: true,
        emphasisNote: true,
        monthlyPriceCents: true,
        quarterlyPriceCents: true,
        yearlyPriceCents: true,
        bookTitle: true,
        contentComplete: true,
        bookPriceCents: true,
        publishedAt: true,
        updatedAt: true,
        // The catalogue row these two are SUPERSEDED by when it is live — see
        // `courseBook`. Selected on the list and not only on the detail read,
        // because the card and the course page have to quote one price: a rail
        // that advertises 250 and a page that charges 300 is the same bug as
        // the one `courseBook` exists to close, one screen earlier.
        book: { select: COURSE_BOOK_SELECT },
        system: { select: { slug: true, nameAr: true } },
        track: { select: { labelAr: true } },
        subject: { select: { nameAr: true } },
        lessons: {
          where: PUBLISHED_LESSON,
          select: {
            kind: true,
            estimatedSeconds: true,
            video: { select: { durationSeconds: true } },
          },
        },
      },
    });

    const courses = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      systemSlug: row.system.slug,
      systemNameAr: row.system.nameAr,
      year: row.year,
      trackLabelAr: row.track?.labelAr ?? null,
      subjectNameAr: row.subject.nameAr,
      coverKey: row.coverKey,
      forGeneral: row.forGeneral,
      forLanguages: row.forLanguages,
      emphasis: row.emphasis,
      emphasisNote: row.emphasisNote,
      monthlyPriceCents: row.monthlyPriceCents,
      quarterlyPriceCents: row.quarterlyPriceCents,
      yearlyPriceCents: row.yearlyPriceCents,
      /* `bookId` is deliberately dropped: it is what `priceCourseBook` needs in
         order to attach an order line to a catalogue row, and nothing a public
         payload should carry. Destructured rather than spread so adding a field
         to `CourseBook` can never leak it onto the site. */
      bookTitle: courseBook(row).bookTitle,
      bookPriceCents: courseBook(row).bookPriceCents,
      contentComplete: row.contentComplete,
      lessonCount: row.lessons.filter(isLecture).length,
      // The video's real duration wins; estimatedSeconds is the fallback for
      // text and attachment lessons that have no duration of their own.
      totalSeconds: row.lessons.reduce(
        (sum, lesson) => sum + (lesson.video?.durationSeconds ?? lesson.estimatedSeconds),
        0,
      ),
      // publishedAt is non-null for published courses — the
      // courses_published_has_timestamp CHECK guarantees it.
      publishedAt: (row.publishedAt as Date).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    return { courses, total: courses.length };
  }

  async findBySlug(slug: string): Promise<CatalogCourseDetail> {
    const row = await this.prisma.course.findFirst({
      // Compiled into the query, not checked after the fetch. A draft is
      // NOT FOUND, not FORBIDDEN — 403 confirms the slug exists and turns the
      // catalog into an oracle for unreleased course names.
      where: { slug, status: 'published' },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
        year: true,
        coverKey: true,
        forGeneral: true,
        forLanguages: true,
        emphasis: true,
        emphasisNote: true,
        // The admin's «لسه هننزل قريبًا» wording. Returned unconditionally —
        // it is cheap, and the CLIENT decides whether to show it (or the
        // stock fallback) once it also knows `lessonCount`, computed below.
        comingSoonNote: true,
        contentComplete: true,
        monthlyPriceCents: true,
        quarterlyPriceCents: true,
        yearlyPriceCents: true,
        bookTitle: true,
        bookPriceCents: true,
        publishedAt: true,
        updatedAt: true,
        // ⚠️ `id`/`slug` of the book are deliberately NOT selected. They would
        // let the page deep-link «اطلب الكتاب» straight into `/books/[slug]`,
        // which is the obvious next step — but `CatalogCourseSchema` has no
        // field to carry them, and this serializer is typed against that
        // allowlist on purpose (see its own note). Adding them here without the
        // contract would be dead weight on the query.
        book: { select: COURSE_BOOK_SELECT },
        system: { select: { slug: true, nameAr: true } },
        track: { select: { labelAr: true } },
        subject: { select: { nameAr: true } },
        // الترم الأول / الترم الثاني — only OPEN, PRICED ones are worth
        // telling a visitor about; a closed or unpriced term is not for sale
        // and offering it would be a checkout button that 400s on submit.
        terms: {
          where: { isOpen: true, priceCents: { not: null } },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, priceCents: true },
        },
        sections: {
          // ⚠️ Excluded from the PUBLIC outline. A monthly exam's title is
          // «امتحان نص شهر سبتمبر» — a fact about this month's cohort, on a
          // marketing page nobody asked to change, that would also tell a
          // stranger the exam schedule.
          where: { isPublished: true, title: { not: EXAM_SHELF_TITLE } },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            summary: true,
            lessons: {
              where: { isPublished: true },
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                title: true,
                kind: true,
                estimatedSeconds: true,
                isFreePreview: true,
                forGeneral: true,
                forLanguages: true,
                // `durationSeconds` only. `externalId` is NOT selected — see
                // the serializer below and `CatalogLessonSchema`.
                video: { select: { durationSeconds: true } },
              },
            },
          },
        },
      },
    });

    if (!row) throw new NotFoundException();

    const lessons = row.sections.flatMap((section) => section.lessons);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      systemSlug: row.system.slug,
      systemNameAr: row.system.nameAr,
      year: row.year,
      trackLabelAr: row.track?.labelAr ?? null,
      subjectNameAr: row.subject.nameAr,
      coverKey: row.coverKey,
      forGeneral: row.forGeneral,
      forLanguages: row.forLanguages,
      emphasis: row.emphasis,
      emphasisNote: row.emphasisNote,
      comingSoonNote: row.comingSoonNote,
      contentComplete: row.contentComplete,
      monthlyPriceCents: row.monthlyPriceCents,
      quarterlyPriceCents: row.quarterlyPriceCents,
      yearlyPriceCents: row.yearlyPriceCents,
      /* `bookId` is deliberately dropped: it is what `priceCourseBook` needs in
         order to attach an order line to a catalogue row, and nothing a public
         payload should carry. Destructured rather than spread so adding a field
         to `CourseBook` can never leak it onto the site. */
      bookTitle: courseBook(row).bookTitle,
      bookPriceCents: courseBook(row).bookPriceCents,
      terms: row.terms.map((term) => ({
        id: term.id,
        title: term.title,
        // Guaranteed non-null by the `priceCents: { not: null }` filter
        // above — the type system cannot see that, so this is asserted
        // rather than left nullable on a schema this specific query cannot
        // actually return null for.
        priceCents: term.priceCents as number,
      })),
      lessonCount: lessons.filter(isLecture).length,
      totalSeconds: lessons.reduce(
        (sum, lesson) => sum + (lesson.video?.durationSeconds ?? lesson.estimatedSeconds),
        0,
      ),
      publishedAt: (row.publishedAt as Date).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      sections: row.sections.map((section) => ({
        id: section.id,
        title: section.title,
        summary: section.summary,
        lessons: section.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          kind: lesson.kind,
          estimatedSeconds: lesson.estimatedSeconds,
          isFreePreview: lesson.isFreePreview,
          forGeneral: lesson.forGeneral,
          forLanguages: lesson.forLanguages,
          // ⚠️ No video id, for ANY lesson — free preview included.
          //
          // This route is `@Public()`. It used to publish `externalId` for
          // free-preview lessons, which is how the public course page came to
          // play a video to visitors with no account at all. Per
          // `2026-08-03-login-gated-content-design.md` §4.1 the id is now
          // reachable only through `GET /api/lessons/:lessonId/player` —
          // session AND active enrollment required.
          //
          // Duration stays: it is a table-of-contents fact, not a key.
          durationSeconds: lesson.video?.durationSeconds ?? null,
        })),
      })),
    };
  }

  /**
   * لوحة الشرف — the named students on the landing page.
   *
   * ## Ordered the way the instructor decides, not the way the score does
   *
   * `instructor_rating` first, then the percentage, then who was added first.
   * That order is the feature: ten students reach full marks on a monthly exam
   * and only one can be الأول, and the thing that separates them is his own
   * read of the papers — not a tiebreak the database invents.
   *
   * ## Only what an instructor put here
   *
   * `honor_board_at IS NOT NULL` is the entire membership rule. Nothing here
   * derives from the score, and that is deliberate: a board that filled itself
   * would publish a child's name and photograph on the public internet because
   * they did well on a quiz.
   *
   * ## No ids on the wire
   *
   * This is the only public payload on the platform that describes a named
   * minor. A user id or an attempt id on it would let a stranger enumerate
   * students straight from the landing page, so the projection carries a name,
   * a photo key, the exam and the mark, and stops.
   *
   * Twelve rows. The board has four visible places and the section is not a
   * leaderboard — a cap keeps a forgotten toggle from turning the landing page
   * into a class list.
   */
  async honorBoard(): Promise<HonorBoard> {
    const rows = await this.prisma.quizAttempt.findMany({
      where: { honorBoardAt: { not: null }, state: 'submitted' },
      orderBy: [
        { instructorRating: 'desc' },
        { scaledScore: 'desc' },
        { honorBoardAt: 'asc' },
      ],
      take: 12,
      select: {
        scaledScore: true,
        gradeOutOf: true,
        user: {
          select: { image: true, studentProfile: { select: { fullName: true } } },
        },
        quiz: { select: { lesson: { select: { title: true } } } },
      },
    });

    return {
      entries: rows.map((row) => {
        const scaledScore = Number(row.scaledScore ?? 0);
        const gradeOutOf = Number(row.gradeOutOf);
        return {
          studentName: row.user.studentProfile?.fullName ?? '—',
          avatarKey: row.user.image,
          quizTitle: row.quiz.lesson.title,
          scaledScore,
          gradeOutOf,
          // Clamped: a paper whose slots were edited after it was sat can
          // score above its own total, and the contract caps this at 100 —
          // an uncaught 104 would fail the parse and blank the landing page.
          percent:
            gradeOutOf > 0
              ? Math.min(Math.max(Math.round((scaledScore / gradeOutOf) * 100), 0), 100)
              : 0,
        };
      }),
    };
  }

}
