import type { HonorBoardPeriod } from '@ayman/contracts/admin/exams';
import { TENANT_GRADES } from '../../common/tenant';

/**
 * لوحة الشرف — turning pinned attempts into rounds.
 *
 * Split out of `CatalogService` because it is the whole feature and it is
 * pure: which race a place was won in, what place it was, and which round it
 * belongs to. All three are easy to get wrong and none of them needs a
 * database to be wrong in front of a test — `catalog.service.spec.ts` is
 * DB-backed and seeding a course, a section, a lesson, a quiz, a user and an
 * attempt to assert "these two are both first" would test Prisma, not this.
 *
 * ## مصدرين، لوحة واحدة
 *
 * الورقة المثبّتة (`quiz_attempts.honor_board_at`) بتيجي بدرجتها وبترتيبها
 * محسوب من التقييم والدرجة. والصف اللي المدرّس حطّه بإيده
 * (`honor_board_pins`) بيجي بمركز مكتوب ومن غير درجة أصلاً — «الأول على
 * الدفعة» مالهاش ٤٧ من ٥٠.
 *
 * الاتنين بيتبوّبوا على نفس اليوم المصري، فتكريم يدوي على يوم ورقة مثبّتة
 * بيقع في نفس الدور — وده المقصود: «كمّل الدور بواحد تاني» من غير ما اللي
 * موجود يتفك ويترجّع.
 */

/** The minimum of a `quiz_attempts` row this file reads. Declared here rather
 *  than inferred from the query so the test can build one by hand. */
export interface PinnedAttempt {
  honorBoardAt: Date;
  scaledScore: unknown;
  gradeOutOf: unknown;
  user: {
    image: string | null;
    studentProfile: { fullName: string; honorPhotoKey: string | null } | null;
  };
  quiz: {
    lesson: {
      title: string;
      course: { year: number; forGeneral: boolean; forLanguages: boolean };
    };
  };
}

/** The minimum of a `honor_board_pins` row this file reads — same contract as
 *  `PinnedAttempt` above and for the same reason. */
export interface ManualPin {
  honoredAt: Date;
  rank: number;
  reason: string;
  photoKey: string | null;
  /** The course the place was won in, or null — then the chip is built from
   *  the student's own year and stream, below. */
  course: { year: number; forGeneral: boolean; forLanguages: boolean } | null;
  /** The month-exam paper the place was earned on («الأوائل من امتحان
   *  الشهر»), or null/absent for a pin added by hand. Only its mark is read:
   *  the rank stays the instructor's. */
  attempt?: { scaledScore: unknown; gradeOutOf: unknown } | null;
  user: {
    image: string | null;
    studentProfile: {
      fullName: string;
      honorPhotoKey: string | null;
      year: number | null;
      schoolStream: string | null;
    } | null;
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
const YEAR_CHIP: Record<number, string> = {
  1: 'أولى بكالوريا',
  2: 'تانية بكالوريا',
  3: 'تالتة بكالوريا',
};

/**
 * The chip on a stack with `TENANT_GRADES`: «تالتة إعدادي», «أولى ثانوي».
 *
 * There a year number is two grades, so the system decides. A caller that
 * did not select it (a manual pin built from a profile) gets the grade only
 * when exactly one of the stack's grades has that year — and nothing
 * otherwise, the same "leave the line empty rather than guess" rule as an
 * unknown year below.
 */
const SPOKEN_YEAR = ['أولى', 'تانية', 'تالتة'] as const;
const SPOKEN_STAGE: Record<string, string> = {
  preparatory: 'إعدادي',
  thanaweya_amma: 'ثانوي',
  bacalorya: 'بكالوريا',
};

function gradeChip(year: number, systemSlug: string | undefined): string | null {
  if (TENANT_GRADES.length === 0) return null;
  const candidates = TENANT_GRADES.filter(
    (g) => g.year === year && (systemSlug === undefined || g.system === systemSlug),
  );
  const grade = candidates.length === 1 ? candidates[0]! : undefined;
  return grade ? `${SPOKEN_YEAR[grade.year - 1]} ${SPOKEN_STAGE[grade.system]}` : '';
}

export function courseChip(course: {
  year: number;
  forGeneral: boolean;
  forLanguages: boolean;
  system?: { slug: string } | null;
}): string {
  /*
   * التلات سنين مذكورة بالاسم، مش `=== 1 ? … : …`.
   *
   * السنة بتوصل هنا من مكانين: كورس، وبروفايل طالب — و`onboarding.ts`
   * بيقبل `.min(1).max(3)`، وفيه فعلًا طلبة سنة تالتة وكورسات سنة تالتة.
   * جيت ثنائي كان بيطبع «تانية بكالوريا» تحت اسم طالب في تالتة، على صفحة
   * عامة، وهو غلط ما بيبانش غير لصاحبه.
   *
   * وسنة برّه التلاتة بترجّع نص فاضي — الكارت بيسيب السطر ملهوش مكان، زي
   * الطالب اللي ما اتسألش أصلًا.
   */
  const year = gradeChip(course.year, course.system?.slug) ?? YEAR_CHIP[course.year];
  if (!year) return '';
  if (course.forGeneral === course.forLanguages) return year;
  return `${year} — ${course.forLanguages ? 'لغات' : 'عربي'}`;
}

/**
 * نفس الشارة، متبنية من بروفايل الطالب — للتكريم اليدوي اللي مالوش كورس.
 *
 * «الأول على الدفعة» مش سباق كورس، بس لسه محتاج يقول أنهي سنة: من غير
 * الشارة، أولى وتانية بيقفوا جنب بعض على نفس اللوحة وكأنهم في سباق واحد.
 *
 * سنة فاضية بترجّع نص فاضي — الكارت بيسيب السطر ملهوش مكان بدل ما يخمّن سنة
 * لطالب ما اتسألش. وشعبة فاضية بترجّع السنة لوحدها، بنفس قاعدة الكورس اللي
 * بيخدم الشعبتين.
 */
export function chipFromProfile(
  profile: { year: number | null; schoolStream: string | null } | null,
): string {
  if (!profile || profile.year === null) return '';
  return courseChip({
    year: profile.year,
    forGeneral: profile.schoolStream !== 'languages',
    forLanguages: profile.schoolStream !== 'general',
  });
}

/**
 * `YYYY-MM-DD` in CAIRO. `en-CA` because it is the one locale whose short date
 * IS that format; building the key by hand from the parts is the same string
 * with more ways to be wrong.
 */
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });

/** The round an instant falls in. Exported because the admin screen, the
 *  notification feed and this file all have to agree on it — two formatters
 *  would file the same pin under two different days. */
export function honorDayKey(at: Date): string {
  return dayKey.format(at);
}

/** How many rounds the archive keeps. An older board falls off the archive
 *  rather than off a card. */
const MAX_ROUNDS = 24;

/** One card, before it knows which round it is in. */
interface Draft {
  at: Date;
  courseLabel: string;
  /** Null on a paper: its place is DERIVED from `score` once the round is
   *  known. Set on a hand-added row: the instructor states the place, and it
   *  is taken as written rather than negotiated with the derived ones. */
  rank: number | null;
  /** `placeScore` of the paper, or null on a hand-added row — the only thing
   *  a derived place is decided on. */
  score: number | null;
  /**
   * ورقة ولا إيد.
   *
   * الريل على الصفحة بيكتب تحت التاريخ «اللوحة دي كانت على أنهي امتحان»،
   * وده بيتبني من `entry.title` — واللي في الصف اليدوي هو **سبب التكريم**،
   * جملة مختلفة لكل اسم. من غير الفرق ده، لوحة فيها عشرة أسماء بالإيد
   * بتطبع عشر جمل مركونة بـ« · » في كارت جنبي عرضه ٢٥٠ بكسل.
   *
   * مش `rank === null`: ده بيوصف ترتيب متحسوب، والاتنين بيتصادفوا دلوقتي
   * بس مش نفس السؤال.
   */
  fromExam: boolean;
  entry: {
    studentName: string;
    avatarKey: string | null;
    photoKey: string | null;
    title: string;
    scaledScore: number | null;
    gradeOutOf: number | null;
    percent: number | null;
  };
}

function draftFromAttempt(row: PinnedAttempt): Draft {
  const scaledScore = Number(row.scaledScore ?? 0);
  const gradeOutOf = Number(row.gradeOutOf);
  return {
    at: row.honorBoardAt,
    courseLabel: courseChip(row.quiz.lesson.course),
    rank: null,
    score: placeScore(row.scaledScore, row.gradeOutOf),
    fromExam: true,
    entry: {
      studentName: row.user.studentProfile?.fullName ?? '—',
      avatarKey: row.user.image,
      // The photo the BOARD shows, which is not the avatar above it —
      // one is the student's own and this page is public. Null is the
      // ordinary case and the card draws initials for it.
      photoKey: row.user.studentProfile?.honorPhotoKey ?? null,
      title: row.quiz.lesson.title,
      scaledScore,
      gradeOutOf,
      // Clamped: a paper whose slots were edited after it was sat can
      // score above its own total, and the contract caps this at 100 —
      // an uncaught 104 would fail the parse and blank the landing page.
      percent:
        gradeOutOf > 0
          ? Math.min(Math.max(Math.round((scaledScore / gradeOutOf) * 100), 0), 100)
          : 0,
    },
  };
}

function draftFromPin(row: ManualPin): Draft {
  const profile = row.user.studentProfile;
  const mark = markOf(row.attempt ?? null);
  return {
    at: row.honoredAt,
    courseLabel: row.course ? courseChip(row.course) : chipFromProfile(profile),
    rank: row.rank,
    score: null,
    // A pin ranked from a month exam names that exam in the archive rail,
    // exactly like a paper pinned from the grading screen.
    fromExam: mark !== null,
    entry: {
      studentName: profile?.fullName ?? '—',
      avatarKey: row.user.image,
      /* The pin's own photo first, then the student's board photo. Two
         columns and not one because «صورة الطالب على اللوحة» and «صورة
         التكريم ده» are different facts: setting the second must not
         overwrite the first, which every other round is still drawing. */
      photoKey: row.photoKey ?? profile?.honorPhotoKey ?? null,
      title: row.reason,
      // No paper, no mark. Zero here would read as «جاب صفر» — see the
      // contract's own note on the three nullable fields.
      scaledScore: mark?.scaledScore ?? null,
      gradeOutOf: mark?.gradeOutOf ?? null,
      percent: mark?.percent ?? null,
    },
  };
}

/** The mark of the paper behind a pin, all three fields or none — the
 *  contract's rule. Clamped for the reason `draftFromAttempt` gives. */
function markOf(
  attempt: { scaledScore: unknown; gradeOutOf: unknown } | null,
): { scaledScore: number; gradeOutOf: number; percent: number } | null {
  if (!attempt || attempt.scaledScore === null || attempt.scaledScore === undefined) return null;
  const scaledScore = Number(attempt.scaledScore);
  const gradeOutOf = Number(attempt.gradeOutOf);
  if (!Number.isFinite(scaledScore) || !(gradeOutOf > 0)) return null;
  return {
    scaledScore,
    gradeOutOf,
    percent: Math.min(Math.max(Math.round((scaledScore / gradeOutOf) * 100), 0), 100),
  };
}

/**
 * The number a derived place is decided on: the paper's share of its own
 * total, clamped exactly like `percent`, in millionths.
 *
 * A share and not `scaledScore`, because one course can sit two papers with
 * different totals on the same day and 48/50 is the same result as 96/100.
 * NOT the rounded `percent`, because 99.75 rounds to 100 and «a 100 is الأول»
 * means a real 100 — 99.75 is the next place down. Millionths, so two equal
 * shares reached through different divisions compare equal as integers.
 */
export function placeScore(scaledScore: unknown, gradeOutOf: unknown): number {
  const score = Number(scaledScore ?? 0);
  const outOf = Number(gradeOutOf);
  if (!Number.isFinite(score) || !(outOf > 0)) return 0;
  return Math.round(Math.min(Math.max(score / outOf, 0), 1) * 1_000_000);
}

/**
 * Dense rank by score within each group: every row on the top score is 1, the
 * next DISTINCT score is 2, and so on — `[100, 100, 100, 99, 98]` is
 * `[1, 1, 1, 2, 3]`, never `1, 2, 3, 4, 5`.
 *
 * «اللي جاب ١٠٠ هو الأول» is the owner's rule, and the only honest one:
 * thirty-six students on 100/100 did not finish in thirty-six different
 * places, and numbering them in the order they happened to be pinned printed
 * «المركز ٣٧» under a student who scored 99. Dense rather than competition
 * ranking («1, 1, 1, 4») because he asked for the next mark down to be
 * «التاني»: the board lists marks worth honouring, not who beat how many.
 *
 * The input order does not matter — a place comes from the score alone. The
 * admin screen and the public board both call this, so they cannot disagree.
 */
export function denseRanks<T>(
  rows: readonly T[],
  groupOf: (row: T) => string,
  scoreOf: (row: T) => number,
): number[] {
  const scores = new Map<string, number[]>();
  for (const row of rows) {
    const list = scores.get(groupOf(row)) ?? [];
    if (!list.includes(scoreOf(row))) list.push(scoreOf(row));
    scores.set(groupOf(row), list);
  }
  for (const list of scores.values()) list.sort((a, b) => b - a);
  return rows.map((row) => (scores.get(groupOf(row)) as number[]).indexOf(scoreOf(row)) + 1);
}

/**
 * Rounds, newest first.
 *
 * A paper's place is its dense rank by score within its course and round
 * (`denseRanks`), so the order `attempts` arrive in no longer decides any
 * place. It still decides the order of cards that SHARE a place — the
 * caller's `orderBy` (rating desc, then pin time) — because the sort below is
 * stable.
 *
 * `pins` carry their own rank and are not ordered by anything here.
 */
export function toHonorBoardRounds(
  attempts: readonly PinnedAttempt[],
  pins: readonly ManualPin[] = [],
): HonorBoardPeriod[] {
  const rounds = new Map<string, Draft[]>();
  /* Attempts first, so a round that has both keeps the derived cards in the
     order the query chose and appends the hand-added ones — which is how the
     instructor built it: the exam board, then the names he added to it. The
     rank sort below is STABLE, so this order survives inside a place. */
  for (const row of [...attempts].map(draftFromAttempt).concat(pins.map(draftFromPin))) {
    const key = honorDayKey(row.at);
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
         * the firsts of different courses — and, since ties share a place,
         * when they are two 100s in the SAME course. The card prints the
         * course chip beside the word, so either reads as one.
         *
         * A paper's place is its dense rank among the round's papers in its
         * course. A hand-added row keeps the place the instructor typed.
         *
         * ## Why a hand-added place no longer pushes the papers down
         *
         * This used to walk each derived place PAST any number a hand-added
         * row had claimed, because two «المركز الأول» in one course read as a
         * contradiction. With ties that is the ordinary board, and the walk
         * became the very bug this rule removes: a manual first would have
         * turned every 100 on the exam into «التاني». A hand-added row has no
         * mark, so it cannot be fitted INTO the score order either — it is
         * taken at its word and stands beside the papers on the same number.
         * The papers' places depend on the papers alone, which is also what
         * lets the admin screen compute the same numbers.
         */
        const papers = group.filter((row) => row.rank === null);
        const derived = denseRanks(
          papers,
          (row) => row.courseLabel,
          (row) => row.score ?? 0,
        );
        const placeOf = new Map(papers.map((row, index) => [row, derived[index] as number]));
        const ranked = group.map((row) => ({
          ...row,
          rank: row.rank ?? (placeOf.get(row) as number),
        }));

        /*
         * Sorted by place, so the rank words read downwards and a paper's
         * card sits under every higher mark — and inside a place, ONE card
         * per course at a time.
         *
         * The landing shows the first four cards (`LANDING_HONOR_PLACES`).
         * With one first per course that read «الأول عربي، الأول لغات، …»;
         * with thirty-five عربي 100s ahead of the لغات ones in the input, a
         * plain place sort would fill all four with عربي and drop لغات off
         * the landing. So inside a place the cards alternate course by course
         * (every course's first card, then every course's second), and inside
         * one course and place they keep the input order — `index` is the
         * last key. The archive groups by course anyway, so this only changes
         * which names the landing picks.
         */
        const turns = new Map<string, number>();
        const entries = ranked
          .map((row, index) => {
            const slot = `${row.courseLabel}::${row.rank}`;
            const turn = turns.get(slot) ?? 0;
            turns.set(slot, turn + 1);
            return { row, index, turn };
          })
          .sort((a, b) => a.row.rank - b.row.rank || a.turn - b.turn || a.index - b.index)
          .map(({ row }) => ({ ...row.entry, courseLabel: row.courseLabel, rank: row.rank }));

        return {
          key,
          // The newest pin in the round. `group` is ordered by RATING, not by
          // time, so this is a max and not `group[0]`.
          pinnedAt: new Date(Math.max(...group.map((row) => row.at.getTime()))).toISOString(),
          // أسامي الامتحانات بس. لوحة كلها بالإيد بيبقى تحتها التاريخ لوحده،
          // وهو الحاجة الوحيدة اللي بتفرّقها عن غيرها أصلًا.
          titles: [...new Set(group.filter((row) => row.fromExam).map((row) => row.entry.title))],
          entries,
        };
      })
  );
}
