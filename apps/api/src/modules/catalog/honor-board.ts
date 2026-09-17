import type { HonorBoardPeriod } from '@ayman/contracts/admin/exams';

/**
 * لوحة الشرف — turning pinned attempts into rounds.
 *
 * Split out of `CatalogService` because it is the whole feature and it is
 * pure: which race a place was won in, what place it was, and which round it
 * belongs to. All three are easy to get wrong and none of them needs a
 * database to be wrong in front of a test — `catalog.service.spec.ts` is
 * DB-backed and seeding a course, a section, a lesson, a quiz, a user and an
 * attempt to assert "these two are both first" would test Prisma, not this.
 */

/** The minimum of a `quiz_attempts` row this file reads. Declared here rather
 *  than inferred from the query so the test can build one by hand. */
export interface PinnedAttempt {
  honorBoardAt: Date;
  scaledScore: unknown;
  gradeOutOf: unknown;
  user: { image: string | null; studentProfile: { fullName: string } | null };
  quiz: {
    lesson: {
      title: string;
      course: { year: number; forGeneral: boolean; forLanguages: boolean };
    };
  };
}

/**
 * «تانية بكالوريا — لغات» — the course a board place was won in, short enough
 * to sit in a chip.
 *
 * Built from `year` and the two stream flags rather than from the course
 * title, which is owner-editable copy: a chip sliced out of «منهج البرمجة
 * وعلوم الحاسب — تانية بكالوريا (عربي)» breaks the first time he renames it.
 *
 * A course serving BOTH streams gets no stream half — `courses_serves_a_stream`
 * allows it (the foundation course is one), and «تانية بكالوريا» alone is the
 * honest label for a race both streams ran together.
 */
export function courseChip(course: {
  year: number;
  forGeneral: boolean;
  forLanguages: boolean;
}): string {
  const year = course.year === 1 ? 'أولى بكالوريا' : 'تانية بكالوريا';
  if (course.forGeneral === course.forLanguages) return year;
  return `${year} — ${course.forLanguages ? 'لغات' : 'عربي'}`;
}

/**
 * `YYYY-MM-DD` in CAIRO. `en-CA` because it is the one locale whose short date
 * IS that format; building the key by hand from the parts is the same string
 * with more ways to be wrong.
 */
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });

/** How many rounds the archive keeps. An older board falls off the archive
 *  rather than off a card. */
const MAX_ROUNDS = 24;

/**
 * Rounds, newest first.
 *
 * ⚠️ `rows` must already be ordered the way the board ranks — rating desc,
 * then score desc. `rank` is assigned by WALKING that order per course, so a
 * caller that hands this an unordered list gets plausible-looking ranks that
 * are wrong. The one caller's `orderBy` does exactly that; this is the
 * contract between them.
 */
export function toHonorBoardRounds(rows: readonly PinnedAttempt[]): HonorBoardPeriod[] {
  const rounds = new Map<string, PinnedAttempt[]>();
  for (const row of rows) {
    const key = dayKey.format(row.honorBoardAt);
    const bucket = rounds.get(key);
    if (bucket) bucket.push(row);
    else rounds.set(key, [row]);
  }

  return (
    [...rounds.entries()]
      // The keys are `YYYY-MM-DD`, so a string compare IS a date compare — no
      // parsing, and no timezone to get wrong a second time.
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, MAX_ROUNDS)
      .map(([key, group]) => {
        /*
         * `rank` is 1-based WITHIN a course, and this is where that is
         * decided. Two entries on one board are both `rank: 1` when they are
         * the firsts of different courses — that is the intended reading, and
         * the card prints the course chip beside the word so it reads as one.
         */
        const seen = new Map<string, number>();
        const entries = group.map((row) => {
          const scaledScore = Number(row.scaledScore ?? 0);
          const gradeOutOf = Number(row.gradeOutOf);
          const courseLabel = courseChip(row.quiz.lesson.course);
          const rank = (seen.get(courseLabel) ?? 0) + 1;
          seen.set(courseLabel, rank);
          return {
            studentName: row.user.studentProfile?.fullName ?? '—',
            avatarKey: row.user.image,
            quizTitle: row.quiz.lesson.title,
            courseLabel,
            rank,
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
        });
        return {
          key,
          // The newest pin in the round. `group` is ordered by RATING, not by
          // time, so this is a max and not `group[0]`.
          pinnedAt: new Date(
            Math.max(...group.map((row) => row.honorBoardAt.getTime())),
          ).toISOString(),
          examTitles: [...new Set(entries.map((entry) => entry.quizTitle))],
          entries,
        };
      })
  );
}
