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

export function courseChip(course: {
  year: number;
  forGeneral: boolean;
  forLanguages: boolean;
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
  const year = YEAR_CHIP[course.year];
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
  /** Null on a hand-added row: the instructor states the place, and it is
   *  taken as written rather than negotiated with the derived ones. */
  rank: number | null;
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
  return {
    at: row.honoredAt,
    courseLabel: row.course ? courseChip(row.course) : chipFromProfile(profile),
    rank: row.rank,
    fromExam: false,
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
      scaledScore: null,
      gradeOutOf: null,
      percent: null,
    },
  };
}

/**
 * Rounds, newest first.
 *
 * ⚠️ `attempts` must already be ordered the way the board ranks — rating desc,
 * then score desc. Derived `rank` is assigned by WALKING that order per
 * course, so a caller that hands this an unordered list gets plausible-looking
 * ranks that are wrong. The one caller's `orderBy` does exactly that; this is
 * the contract between them.
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
         * the firsts of different courses — that is the intended reading, and
         * the card prints the course chip beside the word so it reads as one.
         *
         * A hand-added row states its place; a derived one is given the next
         * place in its course that nothing has claimed. So «حطه تاني على
         * اللوحة دي» does not renumber the exam's own first place, and two
         * cards never both read «المركز التاني» because one of them counted.
         */
        const taken = new Map<string, Set<number>>();
        for (const row of group) {
          if (row.rank === null) continue;
          const claimed = taken.get(row.courseLabel) ?? new Set<number>();
          claimed.add(row.rank);
          taken.set(row.courseLabel, claimed);
        }

        const walked = new Map<string, number>();
        const ranked = group.map((row) => {
          if (row.rank !== null) return { ...row, rank: row.rank };
          const claimed = taken.get(row.courseLabel) ?? new Set<number>();
          let next = (walked.get(row.courseLabel) ?? 0) + 1;
          while (claimed.has(next)) next += 1;
          walked.set(row.courseLabel, next);
          return { ...row, rank: next };
        });

        /* Sorted by place, not by source. Stable, so cards sharing a place —
           the first of عربي and the first of لغات — keep the order above.
           Without this a hand-added first place would print under the exam's
           third, and the column of rank words would not read downwards. */
        const entries = ranked
          .map((row, index) => ({ row, index }))
          .sort((a, b) => a.row.rank - b.row.rank || a.index - b.index)
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
