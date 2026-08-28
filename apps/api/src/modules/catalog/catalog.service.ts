import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CatalogCourseDetail,
  CatalogList,
  CatalogStreamFilter,
} from '@ayman/contracts/catalog';
import { PrismaService } from '../../prisma/prisma.service';

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
        publishedAt: true,
        updatedAt: true,
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
        monthlyPriceCents: true,
        quarterlyPriceCents: true,
        yearlyPriceCents: true,
        publishedAt: true,
        updatedAt: true,
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
          where: { isPublished: true },
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
      monthlyPriceCents: row.monthlyPriceCents,
      quarterlyPriceCents: row.quarterlyPriceCents,
      yearlyPriceCents: row.yearlyPriceCents,
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
}
