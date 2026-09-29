import { LeaderboardQuerySchema } from '@ayman/contracts/admin/leaderboard';
import type { CohortMember } from './cohort-rank.service';
import { competitiveRanks, standing } from './cohort-rank.service';
import { cohortTabs, filterMembers, matchesSearch, pickCohort, rankMembers, summarize } from './leaderboard';

/**
 * «الأوائل» من غير داتابيز. الأرقام نفسها (النقط) متختبرة في
 * `cohort-rank.service.spec.ts` على داتابيز حقيقية؛ هنا الترتيب والبحث
 * والتابات — الحاجات اللي لو غلطت الشاشة هتقول رقم غير اللي الطالب شايفه.
 */

let seq = 0;
function member(fullName: string, points: number, extra: Partial<CohortMember> = {}): CohortMember {
  seq += 1;
  return {
    userId: `u${String(seq).padStart(3, '0')}`,
    name: fullName.split(' ').slice(0, 2).join(' '),
    fullName,
    points,
    phone: `+20100000${String(seq).padStart(4, '0')}`,
    systemKnown: true,
    stream: null,
    stats: {
      points,
      average: null,
      quizzes: { count: 0, average: null, fullMarks: 0 },
      exams: { count: 0, average: null, fullMarks: 0 },
      homework: { submitted: 0, accepted: 0, owed: 0 },
      pendingReview: 0,
    },
    ...extra,
  };
}

describe('competitiveRanks — «١، ٢، ٢، ٤»', () => {
  it('gives ties one number and skips past them', () => {
    expect(competitiveRanks([300, 200, 200, 100, 100, 100, 0])).toEqual([1, 2, 2, 4, 4, 4, 7]);
  });

  it('handles an empty cohort and a cohort of one', () => {
    expect(competitiveRanks([])).toEqual([]);
    expect(competitiveRanks([0])).toEqual([1]);
  });
});

describe('rankMembers', () => {
  it('orders by points and numbers every row the way the student is numbered', () => {
    const rows = [member('سارة علي', 120), member('مريم حسن', 300), member('أحمد سامي', 120), member('نور', 0)];
    const ranked = rankMembers(rows);

    expect(ranked.map((row) => [row.fullName, row.rank])).toEqual([
      ['مريم حسن', 1],
      // المتعادلين بالأبجدية، ونفس الرقم.
      ['أحمد سامي', 2],
      ['سارة علي', 2],
      ['نور', 4],
    ]);
  });

  /**
   * الضمان اللي الشاشة كلها قايمة عليه: رقم كل طالب في «الأوائل» هو نفس
   * الرقم اللي `standing` بيدّيهوله في `/rank` على نفس اللقطة.
   */
  it('agrees with `standing` for every member of the cohort', () => {
    const rows = [
      member('أ', 500),
      member('ب', 420),
      member('ج', 420),
      member('د', 420),
      member('ه', 90),
      member('و', 0),
      member('ز', 0),
    ];
    for (const row of rankMembers(rows)) {
      const { me } = standing(rows, { userId: row.userId, name: row.name, points: row.points });
      expect(me.rank).toBe(row.rank);
    }
  });
});

describe('matchesSearch', () => {
  const student = { fullName: 'أمجد عبد الرحمن إبراهيم', phone: '+201012345678' };

  it('finds a name typed without the hamza, and part of a name', () => {
    expect(matchesSearch(student, 'امجد')).toBe(true);
    expect(matchesSearch(student, 'عبد  الرحمن')).toBe(true);
    expect(matchesSearch(student, 'ابراهيم')).toBe(true);
    expect(matchesSearch(student, 'محمود')).toBe(false);
  });

  it('finds a phone typed the local way, the international way, or in Arabic digits', () => {
    expect(matchesSearch(student, '01012345678')).toBe(true);
    expect(matchesSearch(student, '+20 101 234 5678')).toBe(true);
    expect(matchesSearch(student, '٠١٠١٢٣٤٥٦٧٨')).toBe(true);
    expect(matchesSearch(student, '5678')).toBe(true);
    expect(matchesSearch(student, '01099999999')).toBe(false);
  });

  it('needs three digits before it searches phones — two match half the cohort', () => {
    expect(matchesSearch(student, '12')).toBe(false);
  });

  it('matches everyone on an empty search', () => {
    expect(matchesSearch(student, '   ')).toBe(true);
  });
});

describe('filterMembers', () => {
  it('narrows the list without renumbering it', () => {
    const ranked = rankMembers([
      member('مريم', 300, { stream: 'languages' }),
      member('سارة', 200, { stream: 'general' }),
      member('نور', 100, { stream: 'languages' }),
    ]);

    const languages = filterMembers(ranked, { q: '', stream: 'languages' });
    expect(languages.map((row) => [row.fullName, row.rank])).toEqual([
      ['مريم', 1],
      ['نور', 3],
    ]);

    const found = filterMembers(ranked, { q: 'سارة' });
    expect(found.map((row) => row.rank)).toEqual([2]);
  });
});

describe('summarize', () => {
  it('counts the cohort, who has points, the mean and the papers still being marked', () => {
    const pending = member('ب', 50);
    pending.stats.pendingReview = 2;
    expect(summarize([member('أ', 150), pending, member('ج', 0)])).toMatchObject({
      size: 3,
      active: 2,
      averagePoints: 66.7,
      pendingReview: 2,
    });
    expect(summarize([])).toMatchObject({ size: 0, active: 0, averagePoints: 0, pendingReview: 0 });
  });

  it('spreads the cohort over the same levels the students see, in order', () => {
    const levels = summarize([member('أ', 0), member('ب', 299), member('ج', 300), member('د', 7000)]).levels;
    expect(levels.map((level) => level.key)).toEqual([
      'bronze',
      'silver',
      'gold',
      'platinum',
      'diamond',
      'master',
      'legend',
    ]);
    expect(Object.fromEntries(levels.map((level) => [level.key, level.count]))).toMatchObject({
      bronze: 2,
      silver: 1,
      gold: 0,
      legend: 1,
    });
  });
});

describe('cohortTabs + pickCohort', () => {
  const bac = '00000000-0000-7000-8000-000000000001';
  const thanaweya = '00000000-0000-7000-8000-000000000002';
  const years = [
    { systemId: thanaweya, year: 1, labelAr: 'الأول الثانوي', systemOrder: 1 },
    { systemId: bac, year: 2, labelAr: 'الثاني بكالوريا', systemOrder: 0 },
    { systemId: bac, year: 1, labelAr: 'الأول بكالوريا', systemOrder: 0 },
  ];

  it('orders by system then year, and counts system-less students into every system of their year', () => {
    const tabs = cohortTabs(years, [
      { systemId: bac, year: 1, n: 10 },
      { systemId: thanaweya, year: 1, n: 4 },
      { systemId: null, year: 1, n: 3 },
      { systemId: bac, year: 2, n: 12 },
      { systemId: null, year: null, n: 40 },
    ]);

    expect(tabs).toEqual([
      { year: 1, systemId: bac, label: 'الأول بكالوريا', size: 13 },
      { year: 2, systemId: bac, label: 'الثاني بكالوريا', size: 12 },
      { year: 1, systemId: thanaweya, label: 'الأول الثانوي', size: 7 },
    ]);
  });

  it('opens the biggest cohort by default, and what the link asks for otherwise', () => {
    const tabs = cohortTabs(years, [
      { systemId: bac, year: 2, n: 30 },
      { systemId: thanaweya, year: 1, n: 30 },
    ]);
    // تعادل: الأول في الترتيب.
    expect(pickCohort(tabs, {})).toEqual({ year: 2, systemId: bac });
    expect(pickCohort(tabs, { year: 1, systemId: thanaweya })).toEqual({ year: 1, systemId: thanaweya });
    // سنة من غير نظام = السنة كلها، نفس دفعة الطالب اللي مالوش نظام.
    expect(pickCohort(tabs, { year: 3 })).toEqual({ year: 3, systemId: null });
    // نظام من غير سنة مالوش معنى.
    expect(pickCohort(tabs, { systemId: thanaweya })).toEqual({ year: 2, systemId: bac });
  });

  it('opens nothing when every cohort is empty', () => {
    expect(pickCohort(cohortTabs(years, []), {})).toBeNull();
  });
});

describe('LeaderboardQuerySchema', () => {
  it('defaults to fifty a page and refuses a page size the other lists do not use', () => {
    expect(LeaderboardQuerySchema.parse({})).toMatchObject({ page: 1, perPage: 50, q: '' });
    expect(LeaderboardQuerySchema.safeParse({ perPage: '25' }).success).toBe(false);
    expect(LeaderboardQuerySchema.safeParse({ systemId: 'not-a-uuid' }).success).toBe(false);
    expect(LeaderboardQuerySchema.parse({ year: '2', q: '  مريم ' })).toMatchObject({ year: 2, q: 'مريم' });
  });
});
