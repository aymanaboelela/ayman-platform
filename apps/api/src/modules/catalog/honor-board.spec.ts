import { HonorBoardPeriodSchema } from '@ayman/contracts/admin/exams';
import {
  chipFromProfile,
  courseChip,
  toHonorBoardRounds,
  type ManualPin,
  type PinnedAttempt,
} from './honor-board';

/**
 * No database here on purpose — see the module header. These assert the three
 * things the board actually promises, and each of them is a rule a reader of
 * the page would notice being broken.
 */

const ARABIC = { year: 2, forGeneral: true, forLanguages: false };
const LANGUAGES = { year: 2, forGeneral: false, forLanguages: true };

function pin(over: {
  name: string;
  at: string;
  course?: { year: number; forGeneral: boolean; forLanguages: boolean };
  title?: string;
  score?: number;
  photo?: string | null;
}): PinnedAttempt {
  return {
    honorBoardAt: new Date(over.at),
    scaledScore: over.score ?? 100,
    gradeOutOf: 100,
    user: {
      image: null,
      studentProfile: { fullName: over.name, honorPhotoKey: over.photo ?? null },
    },
    quiz: {
      lesson: {
        title: over.title ?? 'امتحان نص الشهر الأول',
        course: over.course ?? ARABIC,
      },
    },
  };
}

describe('courseChip', () => {
  it('names the year and the stream', () => {
    expect(courseChip(ARABIC)).toBe('تانية بكالوريا — عربي');
    expect(courseChip(LANGUAGES)).toBe('تانية بكالوريا — لغات');
    expect(courseChip({ year: 1, forGeneral: false, forLanguages: true })).toBe(
      'أولى بكالوريا — لغات',
    );
  });

  it('drops the stream half for a course that serves both', () => {
    // The foundation course is one of these, and «تانية بكالوريا — عربي ولغات»
    // would be a label claiming a distinction the race did not make.
    expect(courseChip({ year: 2, forGeneral: true, forLanguages: true })).toBe('تانية بكالوريا');
  });

  it('names THIRD year, and stays silent on a year it has no name for', () => {
    /*
     * `onboarding.ts` بيقبل `.min(1).max(3)`، وفيه دلوقتي طلبة وكورسات في
     * التالتة. الجيت الثنائي القديم كان بيطبع «تانية بكالوريا» تحتيهم على
     * صفحة عامة — غلط ما بيبانش غير لصاحب الاسم.
     */
    expect(courseChip({ year: 3, forGeneral: true, forLanguages: false })).toBe(
      'تالتة بكالوريا — عربي',
    );
    expect(courseChip({ year: 3, forGeneral: true, forLanguages: true })).toBe('تالتة بكالوريا');
    // سنة مش من التلاتة = مفيش شارة، مش شارة مخمّنة.
    expect(courseChip({ year: 4, forGeneral: true, forLanguages: false })).toBe('');
    expect(courseChip({ year: 0, forGeneral: true, forLanguages: false })).toBe('');
  });
});

describe('toHonorBoardRounds', () => {
  it('ranks within a course, so one board has two firsts', () => {
    // THE rule of the whole feature. A عربي first and a لغات first never sat
    // the same paper, so numbering them 1 and 2 down the board would claim a
    // result that does not exist.
    const [round] = toHonorBoardRounds([
      pin({ name: 'زياد', at: '2026-09-17T04:00:00Z', course: ARABIC }),
      pin({ name: 'أميرة', at: '2026-09-17T04:01:00Z', course: LANGUAGES }),
      pin({ name: 'كيرلس', at: '2026-09-17T04:02:00Z', course: ARABIC, score: 96 }),
      pin({ name: 'معاذ', at: '2026-09-17T04:03:00Z', course: LANGUAGES, score: 96 }),
    ]);

    expect(round.entries.map((e) => [e.studentName, e.rank])).toEqual([
      ['زياد', 1],
      ['أميرة', 1],
      ['كيرلس', 2],
      ['معاذ', 2],
    ]);
  });

  it('gives every 100 the first place, and the next mark the second', () => {
    /*
     * THE owner's rule (2026-11-15): «كل اللي جاب ١٠٠ هو الأول». The
     * 2026-10-22 round printed thirty-six 100s as places 1…36 and the 99s
     * from 37 on, because the place was the position in the query.
     */
    const [round] = toHonorBoardRounds([
      pin({ name: 'أ', at: '2026-10-22T10:00:00Z', score: 100 }),
      pin({ name: 'ب', at: '2026-10-22T10:01:00Z', score: 100 }),
      pin({ name: 'ج', at: '2026-10-22T10:02:00Z', score: 100 }),
      pin({ name: 'د', at: '2026-10-22T10:03:00Z', score: 99 }),
      pin({ name: 'ه', at: '2026-10-22T10:04:00Z', score: 99 }),
      pin({ name: 'و', at: '2026-10-22T10:05:00Z', score: 97 }),
    ]);
    expect(round.entries.map((e) => [e.studentName, e.rank])).toEqual([
      ['أ', 1],
      ['ب', 1],
      ['ج', 1],
      ['د', 2],
      ['ه', 2],
      ['و', 3],
    ]);
  });

  it('orders the cards by score however the rows arrive', () => {
    // The place no longer depends on the caller's order, and neither does the
    // column: a 97 handed in first still prints under the 100.
    const [round] = toHonorBoardRounds([
      pin({ name: 'سبعة وتسعين', at: '2026-10-22T10:00:00Z', score: 97 }),
      pin({ name: 'مية', at: '2026-10-22T10:01:00Z', score: 100 }),
      pin({ name: 'تسعة وتسعين', at: '2026-10-22T10:02:00Z', score: 99 }),
    ]);
    expect(round.entries.map((e) => [e.studentName, e.rank])).toEqual([
      ['مية', 1],
      ['تسعة وتسعين', 2],
      ['سبعة وتسعين', 3],
    ]);
  });

  it('ranks on the exact mark, not the rounded percent', () => {
    // 99.75 rounds to a «100%», but it is not a 100: it is the next place.
    // And 48/50 is the same result as 96/100 on a second paper that day.
    const [round] = toHonorBoardRounds([
      pin({ name: 'مية', at: '2026-10-22T10:00:00Z', score: 100 }),
      pin({ name: 'تسعة وتسعين ونص', at: '2026-10-22T10:01:00Z', score: 99.75 }),
      pin({ name: 'ستة وتسعين', at: '2026-10-22T10:02:00Z', score: 96 }),
      {
        ...pin({ name: 'تمانية وأربعين من خمسين', at: '2026-10-22T10:03:00Z' }),
        scaledScore: 48,
        gradeOutOf: 50,
      },
    ]);
    expect(round.entries.map((e) => [e.studentName, e.rank, e.percent])).toEqual([
      ['مية', 1, 100],
      ['تسعة وتسعين ونص', 2, 100],
      ['ستة وتسعين', 3, 96],
      ['تمانية وأربعين من خمسين', 3, 96],
    ]);
  });

  it('alternates the courses inside a shared place, so the landing shows both', () => {
    // The landing takes the first four cards. Five عربي 100s ahead of the
    // لغات ones must not fill all four and drop لغات off the page.
    const arabic = ['أ', 'ب', 'ج', 'د', 'ه'].map((name, i) =>
      pin({ name, at: `2026-10-22T10:0${i}:00Z`, course: ARABIC }),
    );
    const languages = ['Ali', 'Mona'].map((name, i) =>
      pin({ name, at: `2026-10-22T11:0${i}:00Z`, course: LANGUAGES }),
    );
    const [round] = toHonorBoardRounds([...arabic, ...languages]);
    expect(round.entries.slice(0, 4).map((e) => e.studentName)).toEqual(['أ', 'Ali', 'ب', 'Mona']);
    expect(round.entries.every((e) => e.rank === 1)).toBe(true);
  });

  it('runs past the tenth place on a board of quarter marks', () => {
    // 100 down to 97 in quarters is thirteen distinct marks. The contract
    // has no ceiling on `rank`, and the cards fall back to «المركز 11».
    const scores = Array.from({ length: 13 }, (_, i) => 100 - i * 0.25);
    const [round] = toHonorBoardRounds(
      scores.map((score, i) => pin({ name: `ط${i}`, at: '2026-10-22T10:00:00Z', score })),
    );
    expect(round.entries.map((e) => e.rank)).toEqual(scores.map((_, i) => i + 1));
    expect(() => HonorBoardPeriodSchema.parse(round)).not.toThrow();
  });

  it('buckets a round by the CAIRO day, not the UTC one', () => {
    // 22:30 UTC is 01:30 the NEXT morning in Cairo. Bucketing on UTC files
    // this pin under the previous day, and the instructor then looks for his
    // round under the wrong date in the rail.
    const [round] = toHonorBoardRounds([pin({ name: 'ريم', at: '2026-09-16T22:30:00Z' })]);
    expect(round.key).toBe('2026-09-17');
  });

  it('keeps rounds newest first and dates each by its LAST pin', () => {
    const rounds = toHonorBoardRounds([
      pin({ name: 'قديم', at: '2026-08-20T09:00:00Z' }),
      pin({ name: 'جديد', at: '2026-09-17T06:00:00Z' }),
      // Deliberately not last in the input: the rows arrive ordered by RATING,
      // so `pinnedAt` has to be a max over the round and not its first row.
      pin({ name: 'جديد كمان', at: '2026-09-17T09:00:00Z' }),
    ]);

    expect(rounds.map((r) => r.key)).toEqual(['2026-09-17', '2026-08-20']);
    expect(rounds[0].pinnedAt).toBe('2026-09-17T09:00:00.000Z');
  });

  it('lists each exam in a round once', () => {
    const [round] = toHonorBoardRounds([
      pin({ name: 'أ', at: '2026-09-17T04:00:00Z', title: 'امتحان نص الشهر الأول' }),
      pin({ name: 'ب', at: '2026-09-17T04:01:00Z', title: 'امتحان نص الشهر الأول' }),
      pin({ name: 'ج', at: '2026-09-17T04:02:00Z', title: 'Mid-Month Exam 1' }),
    ]);
    expect(round.titles).toEqual(['امتحان نص الشهر الأول', 'Mid-Month Exam 1']);
  });

  it('clamps a paper that outscores its own total', () => {
    // A quiz whose slots were edited after it was sat. The contract caps
    // `percent` at 100, so an uncaught 104 fails the parse and blanks the
    // landing page rather than showing one odd number.
    const [round] = toHonorBoardRounds([
      pin({ name: 'أ', at: '2026-09-17T04:00:00Z', score: 104 }),
    ]);
    expect(round.entries[0].percent).toBe(100);
    expect(() => HonorBoardPeriodSchema.parse(round)).not.toThrow();
  });

  it('carries the board photo, and only the board photo', () => {
    // `image` is the student's OWN avatar and it must never reach the public
    // card — a Google photo nobody cleared for publication beside a minor's
    // name on the landing page is the exact disclosure this board refuses.
    const row = pin({ name: 'زياد', at: '2026-09-17T04:00:00Z', photo: 'ab/zeyad.webp' });
    row.user.image = 'https://lh3.googleusercontent.com/selfie';

    const [round] = toHonorBoardRounds([row]);
    expect(round.entries[0].photoKey).toBe('ab/zeyad.webp');
  });

  it('leaves the photo null for a winner who has none', () => {
    // The ordinary case, and the card draws initials for it. A '' here would
    // render as a broken image on the one page the whole internet reads.
    const [round] = toHonorBoardRounds([pin({ name: 'معاذ', at: '2026-09-17T04:00:00Z' })]);
    expect(round.entries[0].photoKey).toBeNull();
  });

  it('is empty for an empty board rather than throwing', () => {
    expect(toHonorBoardRounds([])).toEqual([]);
  });
});

/** A hand-added row — `honor_board_pins`, the board without a paper behind it. */
function hand(over: {
  name: string;
  at: string;
  rank: number;
  reason?: string;
  course?: { year: number; forGeneral: boolean; forLanguages: boolean } | null;
  photo?: string | null;
  profilePhoto?: string | null;
  year?: number | null;
  stream?: string | null;
}): ManualPin {
  return {
    honoredAt: new Date(over.at),
    rank: over.rank,
    reason: over.reason ?? 'الأول على الدفعة',
    photoKey: over.photo ?? null,
    course: over.course === undefined ? ARABIC : over.course,
    user: {
      image: null,
      studentProfile: {
        fullName: over.name,
        honorPhotoKey: over.profilePhoto ?? null,
        year: over.year ?? 2,
        schoolStream: over.stream ?? 'general',
      },
    },
  };
}

describe('chipFromProfile', () => {
  it('names the year and the stream off the student, not off a course', () => {
    expect(chipFromProfile({ year: 2, schoolStream: 'languages' })).toBe('تانية بكالوريا — لغات');
    expect(chipFromProfile({ year: 1, schoolStream: 'general' })).toBe('أولى بكالوريا — عربي');
  });

  it('drops the stream half for a profile that never answered', () => {
    // `school_stream` is nullable for the students who predate the question.
    // «تانية بكالوريا — عربي» on one of them would be the card stating a fact
    // nobody ever gave it.
    expect(chipFromProfile({ year: 2, schoolStream: null })).toBe('تانية بكالوريا');
  });

  it('names a third-year student third year', () => {
    // ٣٩ طالب في الداتابيز المحلية سنتهم ٣. الكارت بتاعهم كان بيقول «تانية».
    expect(chipFromProfile({ year: 3, schoolStream: 'general' })).toBe('تالتة بكالوريا — عربي');
    expect(chipFromProfile({ year: 3, schoolStream: null })).toBe('تالتة بكالوريا');
  });

  it('is empty with no year at all', () => {
    // The card leaves the chip line out rather than guessing a year.
    expect(chipFromProfile({ year: null, schoolStream: 'general' })).toBe('');
    expect(chipFromProfile(null)).toBe('');
  });
});

describe('toHonorBoardRounds — the two sources on one board', () => {
  it('files a hand-added row in the same round as a paper pinned that day', () => {
    // THE reason both sources bucket on the Cairo day: «كمّل الدور بواحد
    // تاني» has to land on the board that is already up, not open a second
    // round dated the same afternoon.
    const rounds = toHonorBoardRounds(
      [pin({ name: 'زياد', at: '2026-09-17T04:00:00Z' })],
      [hand({ name: 'ندى', at: '2026-09-17T18:00:00Z', rank: 2 })],
    );

    expect(rounds).toHaveLength(1);
    expect(rounds[0].entries.map((e) => e.studentName)).toEqual(['زياد', 'ندى']);
  });

  it('lets a hand-added first stand BESIDE the exam’s 100, not above it', () => {
    /*
     * The instructor typed 1 for ندى on a round whose exam already had a
     * 100. This used to push زياد's paper to التاني; with ties a shared
     * first is the ordinary board, and pushing a 100 down is the one thing
     * «اللي جاب ١٠٠ هو الأول» forbids. Both read «المركز الأول».
     */
    const [round] = toHonorBoardRounds(
      [pin({ name: 'زياد', at: '2026-09-17T04:00:00Z' })],
      [hand({ name: 'ندى', at: '2026-09-17T18:00:00Z', rank: 1 })],
    );
    expect(round.entries.map((e) => [e.studentName, e.rank])).toEqual([
      ['زياد', 1],
      ['ندى', 1],
    ]);
  });

  it('never renumbers the papers around a hand-added place', () => {
    // Two papers (100, 96) and a hand-added second. The papers' places come
    // from their marks alone, so the 96 is still التاني — beside ندى.
    const [round] = toHonorBoardRounds(
      [
        pin({ name: 'زياد', at: '2026-09-17T04:00:00Z', score: 100 }),
        pin({ name: 'كيرلس', at: '2026-09-17T04:01:00Z', score: 96 }),
      ],
      [hand({ name: 'ندى', at: '2026-09-17T18:00:00Z', rank: 2 })],
    );
    expect(round.entries.map((e) => [e.studentName, e.rank])).toEqual([
      ['زياد', 1],
      ['كيرلس', 2],
      ['ندى', 2],
    ]);
  });

  it('sorts a round by place, so the rank words read downwards', () => {
    const [round] = toHonorBoardRounds(
      [],
      [
        hand({ name: 'تالت', at: '2026-09-17T18:00:00Z', rank: 3 }),
        hand({ name: 'أول', at: '2026-09-17T18:01:00Z', rank: 1 }),
        hand({ name: 'تاني', at: '2026-09-17T18:02:00Z', rank: 2 }),
      ],
    );
    expect(round.entries.map((e) => e.studentName)).toEqual(['أول', 'تاني', 'تالت']);
  });

  it('leaves the mark null on a hand-added row', () => {
    // «الأول على الدفعة» has no 47/50. A zero would read as «جاب صفر» on a
    // public card about a named student.
    const [round] = toHonorBoardRounds([], [hand({ name: 'ندى', at: '2026-09-17T18:00:00Z', rank: 1 })]);
    expect(round.entries[0]).toMatchObject({ scaledScore: null, gradeOutOf: null, percent: null });
    expect(() => HonorBoardPeriodSchema.parse(round)).not.toThrow();
  });

  it('falls back from the pin photo to the profile photo, then to nothing', () => {
    const [round] = toHonorBoardRounds(
      [],
      [
        hand({ name: 'أ', at: '2026-09-17T18:00:00Z', rank: 1, photo: 'ab/pin.webp', profilePhoto: 'cd/profile.webp' }),
        hand({ name: 'ب', at: '2026-09-17T18:01:00Z', rank: 2, profilePhoto: 'cd/profile.webp' }),
        hand({ name: 'ج', at: '2026-09-17T18:02:00Z', rank: 3 }),
      ],
    );
    expect(round.entries.map((e) => e.photoKey)).toEqual(['ab/pin.webp', 'cd/profile.webp', null]);
  });

  it('labels a courseless pin from the student own year and stream', () => {
    // «الأول على الدفعة» is not a course race, but the chip still has to say
    // which year — otherwise أولى and تانية stand side by side as if they ran
    // together.
    const [round] = toHonorBoardRounds(
      [],
      [hand({ name: 'ندى', at: '2026-09-17T18:00:00Z', rank: 1, course: null, year: 1, stream: 'languages' })],
    );
    expect(round.entries[0].courseLabel).toBe('أولى بكالوريا — لغات');
  });

  it('puts the reason on the card line the exam title uses', () => {
    const [round] = toHonorBoardRounds(
      [],
      [hand({ name: 'ندى', at: '2026-09-17T18:00:00Z', rank: 1, reason: 'انتظام كامل' })],
    );
    expect(round.entries[0].title).toBe('انتظام كامل');
  });

  it('keeps the reasons OUT of the rail, and the exam names in', () => {
    /*
     * `titles` بيتطبع تحت التاريخ في الريل الجنبي، وسطره هو
     * `titles.join(' · ')`. السبب على الكارت، مش في الريل: لوحة فيها تلات
     * أسماء بالإيد كانت بتطبع تلات جمل كاملة مركونة في كارت عرضه ٢٥٠ بكسل.
     */
    const [round] = toHonorBoardRounds(
      [pin({ name: 'زياد', at: '2026-09-17T09:00:00Z', title: 'امتحان الشهر' })],
      [
        hand({ name: 'ندى', at: '2026-09-17T18:00:00Z', rank: 1, reason: 'الأولى على الدفعة' }),
        hand({ name: 'مريم', at: '2026-09-17T18:00:00Z', rank: 2, reason: 'أحسن تقدّم في الترم' }),
      ],
    );
    expect(round.titles).toEqual(['امتحان الشهر']);
    // والسبب لسه على الكارت بتاع صاحبه.
    expect(round.entries.map((e) => e.title)).toEqual(
      expect.arrayContaining(['الأولى على الدفعة', 'أحسن تقدّم في الترم']),
    );
  });

  it('leaves the rail line empty for a round that is all hand-added', () => {
    // التاريخ لوحده هو اللي بيفرّقها، وهو مكتوب فوقه أصلًا.
    const [round] = toHonorBoardRounds(
      [],
      [hand({ name: 'ندى', at: '2026-09-17T18:00:00Z', rank: 1, reason: 'انتظام كامل' })],
    );
    expect(round.titles).toEqual([]);
  });
});

describe('toHonorBoardRounds — a pin ranked from a month exam', () => {
  it('keeps the instructor’s rank and prints the paper’s mark', () => {
    const [round] = toHonorBoardRounds(
      [],
      [
        {
          ...hand({ name: 'ندى', at: '2026-10-18T10:00:00Z', rank: 2, reason: 'امتحان آخر الشهر' }),
          attempt: { scaledScore: '48', gradeOutOf: '50' },
        },
        {
          ...hand({ name: 'ريم', at: '2026-10-18T10:00:00Z', rank: 1, reason: 'امتحان آخر الشهر' }),
          attempt: { scaledScore: '47', gradeOutOf: '50' },
        },
      ],
    );
    // He put the 47 first; the board does not "correct" him by score.
    expect(round.entries.map((e) => [e.studentName, e.rank])).toEqual([
      ['ريم', 1],
      ['ندى', 2],
    ]);
    expect(round.entries[1]).toMatchObject({ scaledScore: 48, gradeOutOf: 50, percent: 96 });
    // And the rail names the exam, like a paper pinned from grading.
    expect(round.titles).toEqual(['امتحان آخر الشهر']);
  });

  it('still prints no mark on a hand-added pin', () => {
    const [round] = toHonorBoardRounds([], [hand({ name: 'ندى', at: '2026-10-18T10:00:00Z', rank: 1 })]);
    expect(round.entries[0]).toMatchObject({ scaledScore: null, gradeOutOf: null, percent: null });
  });
});
