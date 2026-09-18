import { HonorBoardPeriodSchema } from '@ayman/contracts/admin/exams';
import { courseChip, toHonorBoardRounds, type PinnedAttempt } from './honor-board';

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
  gender?: 'male' | 'female';
}): PinnedAttempt {
  return {
    honorBoardAt: new Date(over.at),
    scaledScore: over.score ?? 100,
    gradeOutOf: 100,
    user: {
      image: null,
      studentProfile: { fullName: over.name, gender: over.gender ?? 'male' },
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
});

describe('toHonorBoardRounds', () => {
  it('ranks within a course, so one board has two firsts', () => {
    // THE rule of the whole feature. A عربي first and a لغات first never sat
    // the same paper, so numbering them 1 and 2 down the board would claim a
    // result that does not exist.
    const [round] = toHonorBoardRounds([
      pin({ name: 'زياد', at: '2026-09-17T04:00:00Z', course: ARABIC }),
      pin({ name: 'أميرة', at: '2026-09-17T04:01:00Z', course: LANGUAGES }),
      pin({ name: 'كيرلس', at: '2026-09-17T04:02:00Z', course: ARABIC }),
      pin({ name: 'معاذ', at: '2026-09-17T04:03:00Z', course: LANGUAGES }),
    ]);

    expect(round.entries.map((e) => [e.studentName, e.rank])).toEqual([
      ['زياد', 1],
      ['أميرة', 1],
      ['كيرلس', 2],
      ['معاذ', 2],
    ]);
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
    expect(round.examTitles).toEqual(['امتحان نص الشهر الأول', 'Mid-Month Exam 1']);
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

  it('picks the drawing from the stored gender, never from the name', () => {
    // The platform does not guess this anywhere else and must not start here:
    // «أميرة» is a girl's name and «زياد» a boy's, and both rows below say the
    // opposite. The stored column is what decides.
    const [round] = toHonorBoardRounds([
      pin({ name: 'أميرة', at: '2026-09-17T04:00:00Z', gender: 'male' }),
      pin({ name: 'زياد', at: '2026-09-17T04:01:00Z', gender: 'female' }),
    ]);
    expect(round.entries.map((e) => e.avatarVariant)).toEqual(['boy', 'girl']);
  });

  it('is empty for an empty board rather than throwing', () => {
    expect(toHonorBoardRounds([])).toEqual([]);
  });
});
