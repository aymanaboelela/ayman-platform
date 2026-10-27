import { Injectable } from '@nestjs/common';
import { isFeatureEnabled } from '../../common/entitlements';
import { PrismaService } from '../../prisma/prisma.service';
import { buildCertificates, type AttemptRow, type QuizLessonRow } from '../share-cards/certificates';
import {
  certificatesFacts,
  coursePath,
  honorRounds,
  newsPath,
  previousWeek,
  resultsFacts,
  resultsSettled,
  type Candidate,
  type EarnedCertificate,
  type HonorEntry,
} from './social-sources';

const DAY_MS = 86_400_000;

/** How far back each source looks. Bounded, so the first scan after deploy
 *  drafts the last fortnight — not the platform's whole history. */
const HONOR_LOOKBACK_DAYS = 14;
const RESULTS_LOOKBACK_DAYS = 21;
const CONTENT_LOOKBACK_DAYS = 14;
/** A lecture created long ago and published today still counts; one edited today but published months ago is in the table already. */
const LECTURE_CREATED_LOOKBACK_DAYS = 30;
const LECTURE_TOUCHED_LOOKBACK_DAYS = 3;

/** The certificate digest reads every final mark of everyone active that week; a cap keeps one scan bounded. */
const CERTIFICATE_MAX_STUDENTS = 2_000;

/**
 * Reads the platform for events worth a post. Each source answers
 * `Candidate[]`; deciding what is NEW is the caller's (`freshCandidates`, then
 * the UNIQUE index).
 *
 * `known` is the set of source keys already in the table for the keys a
 * source is about to compute — the expensive sources (results, the weekly
 * certificate digest) check it BEFORE doing the work, so an event already
 * drafted costs one indexed lookup per scan, not a recomputation.
 *
 * Students are `role = 'student'` only, everywhere: a staff account sitting
 * a quiz to test it must not appear «on the honor board» of a public page.
 */
@Injectable()
export class SocialSourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async all(now: Date): Promise<Candidate[]> {
    const groups = await Promise.all([
      isFeatureEnabled('honorBoard') ? this.honor(now) : Promise.resolve([]),
      this.results(now),
      isFeatureEnabled('shareCards') ? this.certificates(now) : Promise.resolve([]),
      this.courses(now),
      this.lectures(now),
      this.news(now),
    ]);
    return groups.flat();
  }

  private async known(keys: readonly string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.prisma.socialPost.findMany({
      where: { sourceKey: { in: [...keys] } },
      select: { sourceKey: true },
    });
    return new Set(rows.map((row) => row.sourceKey));
  }

  /** The honor board: pinned papers and hand-placed pins, one post per Cairo day. */
  async honor(now: Date): Promise<Candidate[]> {
    const since = new Date(now.getTime() - HONOR_LOOKBACK_DAYS * DAY_MS);
    const [attempts, pins] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: { honorBoardAt: { gte: since }, state: 'submitted', user: { role: 'student' } },
        select: {
          honorBoardAt: true,
          scaledScore: true,
          gradeOutOf: true,
          user: { select: { name: true, studentProfile: { select: { fullName: true, honorPhotoKey: true } } } },
          quiz: { select: { lesson: { select: { title: true } } } },
          // A paper already behind a pin is that pin's mark; counting it twice
          // would print one student twice on the same post.
          honorPin: { select: { id: true } },
        },
      }),
      this.prisma.honorBoardPin.findMany({
        where: { honoredAt: { gte: since }, user: { role: 'student' } },
        select: {
          honoredAt: true,
          rank: true,
          reason: true,
          photoKey: true,
          attempt: { select: { scaledScore: true, gradeOutOf: true, quiz: { select: { lesson: { select: { title: true } } } } } },
          user: { select: { name: true, studentProfile: { select: { fullName: true, honorPhotoKey: true } } } },
        },
      }),
    ]);

    const entries: HonorEntry[] = [
      ...attempts
        .filter((row) => row.honorBoardAt && !row.honorPin)
        .map((row) => ({
          at: row.honorBoardAt!,
          fullName: row.user.studentProfile?.fullName ?? row.user.name,
          title: row.quiz.lesson.title,
          photoKey: row.user.studentProfile?.honorPhotoKey ?? null,
          rank: null,
          score: row.scaledScore === null ? null : Number(row.scaledScore),
          total: Number(row.gradeOutOf),
        })),
      ...pins.map((row) => ({
        at: row.honoredAt,
        fullName: row.user.studentProfile?.fullName ?? row.user.name,
        title: row.attempt?.quiz.lesson.title ?? row.reason,
        // The pin's own photo first, then the board photo — the public board's rule.
        photoKey: row.photoKey ?? row.user.studentProfile?.honorPhotoKey ?? null,
        rank: row.rank,
        score: row.attempt?.scaledScore == null ? null : Number(row.attempt.scaledScore),
        total: row.attempt ? Number(row.attempt.gradeOutOf) : null,
      })),
    ];

    return honorRounds(entries, now).map((round) => ({
      sourceKey: `honor:${round.day}`,
      kind: 'honor',
      facts: round.facts,
      path: '/honor-board',
    }));
  }

  /** A finished quiz or exam with a real cohort: average, pass rate, the top three. */
  async results(now: Date): Promise<Candidate[]> {
    const since = new Date(now.getTime() - RESULTS_LOOKBACK_DAYS * DAY_MS);
    const recent = await this.prisma.quizAttempt.groupBy({
      by: ['quizId'],
      where: { state: 'submitted', submittedAt: { gte: since }, scaledScore: { not: null } },
      _max: { submittedAt: true },
    });
    if (recent.length === 0) return [];

    const known = await this.known(recent.map((row) => `results:${row.quizId}`));
    const pending = recent.filter((row) => !known.has(`results:${row.quizId}`));
    if (pending.length === 0) return [];

    const quizzes = await this.prisma.quiz.findMany({
      where: {
        id: { in: pending.map((row) => row.quizId) },
        isPublished: true,
        lesson: { isPublished: true, course: { status: 'published' } },
      },
      select: {
        id: true,
        openUntil: true,
        lesson: { select: { title: true, course: { select: { title: true, slug: true } } } },
      },
    });
    const lastById = new Map(pending.map((row) => [row.quizId, row._max.submittedAt]));
    const settled = quizzes.filter((quiz) => {
      const last = lastById.get(quiz.id);
      return last ? resultsSettled({ openUntil: quiz.openUntil, lastSubmittedAt: last, now }) : false;
    });

    const out: Candidate[] = [];
    for (const quiz of settled) {
      const attempts = await this.prisma.quizAttempt.findMany({
        where: {
          quizId: quiz.id,
          state: 'submitted',
          scaledScore: { not: null },
          submittedAt: { not: null },
          user: { role: 'student' },
        },
        select: {
          userId: true,
          scaledScore: true,
          gradeOutOf: true,
          passPercent: true,
          submittedAt: true,
          user: { select: { name: true, studentProfile: { select: { fullName: true } } } },
        },
      });
      const facts = resultsFacts(
        { examTitle: quiz.lesson.title, courseTitle: quiz.lesson.course.title },
        attempts.map((row) => ({
          userId: row.userId,
          fullName: row.user.studentProfile?.fullName ?? row.user.name,
          score: Number(row.scaledScore),
          total: Number(row.gradeOutOf),
          passPercent: Number(row.passPercent),
          submittedAt: row.submittedAt!,
        })),
      );
      if (facts) {
        out.push({ sourceKey: `results:${quiz.id}`, kind: 'results', facts, path: coursePath(quiz.lesson.course.slug) });
      }
    }
    return out;
  }

  /**
   * Last week's certificates, as one digest. The same rules as «شهاداتي»
   * (`buildCertificates`), run for every student who handed in a paper that
   * week, counting the certificates whose `earnedAt` falls inside it.
   */
  async certificates(now: Date): Promise<Candidate[]> {
    const week = previousWeek(now);
    const sourceKey = `certificates:${week.key}`;
    if ((await this.known([sourceKey])).size > 0) return [];

    const active = await this.prisma.quizAttempt.findMany({
      where: { state: 'submitted', submittedAt: { gte: week.start, lt: week.end }, user: { role: 'student' } },
      distinct: ['userId'],
      select: { userId: true },
      take: CERTIFICATE_MAX_STUDENTS,
    });
    if (active.length === 0) return [];

    const [courses, lessonRows] = await Promise.all([
      this.prisma.course.findMany({
        where: { status: 'published' },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true, slug: true, title: true, examLessonId: true },
      }),
      this.prisma.lesson.findMany({
        where: {
          kind: 'quiz',
          isPublished: true,
          section: { isPublished: true },
          quiz: { isPublished: true },
          course: { status: 'published' },
        },
        orderBy: [{ position: 'asc' }],
        select: { id: true, title: true, courseId: true, sectionId: true, section: { select: { title: true, position: true } } },
      }),
    ]);
    const lessons: QuizLessonRow[] = lessonRows.map((row) => ({
      id: row.id,
      title: row.title,
      courseId: row.courseId,
      sectionId: row.sectionId,
      sectionTitle: row.section.title,
      sectionPosition: row.section.position,
    }));
    if (lessons.length === 0) return [];

    const userIds = active.map((row) => row.userId);
    const [attemptRows, profiles] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: {
          userId: { in: userIds },
          state: 'submitted',
          scaledScore: { not: null },
          submittedAt: { not: null },
          quiz: { lessonId: { in: lessons.map((lesson) => lesson.id) } },
        },
        select: { userId: true, scaledScore: true, gradeOutOf: true, submittedAt: true, quiz: { select: { lessonId: true } } },
      }),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, studentProfile: { select: { fullName: true } } },
      }),
    ]);

    const byUser = new Map<string, AttemptRow[]>();
    for (const row of attemptRows) {
      const list = byUser.get(row.userId) ?? [];
      list.push({ lessonId: row.quiz.lessonId, score: Number(row.scaledScore), total: Number(row.gradeOutOf), submittedAt: row.submittedAt! });
      byUser.set(row.userId, list);
    }
    const nameOf = new Map(profiles.map((row) => [row.id, row.studentProfile?.fullName ?? row.name]));

    const inWeek = (iso: string | null) => {
      if (!iso) return false;
      const t = Date.parse(iso);
      return t >= week.start.getTime() && t < week.end.getTime();
    };

    const earned: EarnedCertificate[] = [];
    for (const [userId, attempts] of byUser) {
      const { units, exams } = buildCertificates(courses, lessons, attempts);
      const fullName = nameOf.get(userId) ?? '';
      for (const unit of units) if (unit.earned && inWeek(unit.earnedAt)) earned.push({ userId, fullName, title: unit.title });
      for (const exam of exams) if (inWeek(exam.earnedAt)) earned.push({ userId, fullName, title: exam.title });
    }

    const facts = certificatesFacts(week.key, earned);
    return facts ? [{ sourceKey, kind: 'certificates', facts, path: '/certificates' }] : [];
  }

  async courses(now: Date): Promise<Candidate[]> {
    const rows = await this.prisma.course.findMany({
      where: { status: 'published', publishedAt: { gte: new Date(now.getTime() - CONTENT_LOOKBACK_DAYS * DAY_MS) } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, slug: true, title: true, subtitle: true, coverKey: true },
    });
    return rows.map((row) => ({
      sourceKey: `course:${row.id}`,
      kind: 'course' as const,
      facts: { kind: 'course' as const, title: row.title, subtitle: row.subtitle, coverKey: row.coverKey },
      path: coursePath(row.slug),
    }));
  }

  /** A published video lecture. Quizzes are not lectures, and a text page is not news. */
  async lectures(now: Date): Promise<Candidate[]> {
    const rows = await this.prisma.lesson.findMany({
      where: {
        kind: 'video',
        isPublished: true,
        createdAt: { gte: new Date(now.getTime() - LECTURE_CREATED_LOOKBACK_DAYS * DAY_MS) },
        updatedAt: { gte: new Date(now.getTime() - LECTURE_TOUCHED_LOOKBACK_DAYS * DAY_MS) },
        section: { isPublished: true },
        course: { status: 'published' },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
      select: {
        id: true,
        title: true,
        video: { select: { posterKey: true } },
        section: { select: { title: true } },
        course: { select: { title: true, slug: true, coverKey: true } },
      },
    });
    return rows.map((row) => ({
      sourceKey: `lecture:${row.id}`,
      kind: 'lecture' as const,
      facts: {
        kind: 'lecture' as const,
        title: row.title,
        courseTitle: row.course.title,
        sectionTitle: row.section.title,
        coverKey: row.video?.posterKey ?? row.course.coverKey,
      },
      path: coursePath(row.course.slug),
    }));
  }

  async news(now: Date): Promise<Candidate[]> {
    const rows = await this.prisma.newsPost.findMany({
      where: { status: 'published', publishedAt: { gte: new Date(now.getTime() - CONTENT_LOOKBACK_DAYS * DAY_MS) } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, slug: true, title: true, excerpt: true, coverKey: true },
    });
    return rows.map((row) => ({
      sourceKey: `news:${row.id}`,
      kind: 'news' as const,
      facts: { kind: 'news' as const, title: row.title, excerpt: row.excerpt, coverKey: row.coverKey },
      path: newsPath(row.slug),
    }));
  }
}
