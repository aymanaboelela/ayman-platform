import {
  RESULTS_MIN_TAKERS,
  cairoWeekStart,
  certificatesFacts,
  freshCandidates,
  honorRounds,
  newsPath,
  previousWeek,
  resultsFacts,
  resultsSettled,
  type Candidate,
  type FinalAttempt,
  type HonorEntry,
} from './social-sources';

const HOUR = 3_600_000;

const candidate = (sourceKey: string): Candidate => ({
  sourceKey,
  kind: 'news',
  facts: { kind: 'news', title: sourceKey, excerpt: '', coverKey: null },
  path: '/news/x',
});

describe('freshCandidates — the dedupe', () => {
  it('drops a key already in the table, so one event never yields two drafts', () => {
    const out = freshCandidates([candidate('news:1'), candidate('news:2')], new Set(['news:1']));
    expect(out.map((row) => row.sourceKey)).toEqual(['news:2']);
  });

  it('drops a key seen twice in the same scan', () => {
    const out = freshCandidates([candidate('honor:2026-10-20'), candidate('honor:2026-10-20')], new Set());
    expect(out).toHaveLength(1);
  });

  it('keeps a skipped draft skipped: its key is still in the table', () => {
    // The scan never asks the status — any row with the key, skipped included, wins.
    expect(freshCandidates([candidate('results:q')], new Set(['results:q']))).toEqual([]);
  });
});

describe('cairo weeks', () => {
  it('starts the week on Saturday, Cairo time', () => {
    // Wed 2026-10-21 12:00 UTC → the week of Sat 2026-10-17.
    expect(cairoWeekStart(new Date('2026-10-21T12:00:00Z')).key).toBe('2026-10-17');
    // Saturday itself, just after Cairo midnight (21:30 UTC Friday).
    expect(cairoWeekStart(new Date('2026-10-23T21:30:00Z')).key).toBe('2026-10-24');
  });

  it('the previous week ends where this one starts', () => {
    const now = new Date('2026-10-27T09:00:00Z');
    const week = previousWeek(now);
    expect(week.key).toBe('2026-10-17');
    expect(week.end.getTime()).toBe(cairoWeekStart(now).start.getTime());
    expect(week.end.getTime() - week.start.getTime()).toBe(7 * 24 * HOUR);
  });
});

function attempt(userId: string, score: number, total = 20, at = '2026-10-10T10:00:00Z'): FinalAttempt {
  return { userId, fullName: `طالب ${userId} محمد`, score, total, passPercent: 50, submittedAt: new Date(at) };
}

describe('resultsFacts', () => {
  const cohort = (n: number) => Array.from({ length: n }, (_, i) => attempt(`u${i}`, 10 + (i % 11)));

  it('needs a real cohort', () => {
    expect(resultsFacts({ examTitle: 'x', courseTitle: 'y' }, cohort(RESULTS_MIN_TAKERS - 1))).toBeNull();
    expect(resultsFacts({ examTitle: 'x', courseTitle: 'y' }, cohort(RESULTS_MIN_TAKERS))).not.toBeNull();
  });

  it("counts each student once, at their best mark", () => {
    const rows = [...cohort(RESULTS_MIN_TAKERS), attempt('u0', 20), attempt('u0', 2)];
    const facts = resultsFacts({ examTitle: 'x', courseTitle: 'y' }, rows)!;
    expect(facts.takers).toBe(RESULTS_MIN_TAKERS);
    expect(facts.top[0]).toMatchObject({ score: 20, total: 20 });
  });

  it('computes the average, the pass rate and full marks', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => attempt(`a${i}`, 20)),
      ...Array.from({ length: 5 }, (_, i) => attempt(`b${i}`, 6)),
    ];
    const facts = resultsFacts({ examTitle: 'x', courseTitle: 'y' }, rows)!;
    expect(facts.averagePercent).toBe(65);
    expect(facts.passRate).toBe(50);
    expect(facts.fullMarks).toBe(5);
  });

  it('breaks a tie at the top by who handed in first, and prints short names only', () => {
    const rows = [
      ...cohort(RESULTS_MIN_TAKERS).map((row) => ({ ...row, score: 5 })),
      { ...attempt('late', 20, 20, '2026-10-10T12:00:00Z'), fullName: 'سارة أحمد علي' },
      { ...attempt('early', 20, 20, '2026-10-10T09:00:00Z'), fullName: 'منى خالد سيد' },
    ];
    const facts = resultsFacts({ examTitle: 'x', courseTitle: 'y' }, rows)!;
    expect(facts.top.map((p) => p.name)).toEqual(['منى خ.', 'سارة أ.', expect.any(String)]);
    expect(facts.top.every((p) => p.photoKey === null)).toBe(true);
  });
});

describe('resultsSettled', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  it('waits for the window to close or two quiet days', () => {
    expect(resultsSettled({ openUntil: new Date('2026-10-20T11:00:00Z'), lastSubmittedAt: now, now })).toBe(true);
    expect(resultsSettled({ openUntil: null, lastSubmittedAt: new Date(now.getTime() - 47 * HOUR), now })).toBe(false);
    expect(resultsSettled({ openUntil: null, lastSubmittedAt: new Date(now.getTime() - 49 * HOUR), now })).toBe(true);
  });
});

describe('honorRounds', () => {
  const entry = (at: string, fullName: string, extra: Partial<HonorEntry> = {}): HonorEntry => ({
    at: new Date(at),
    fullName,
    title: 'امتحان الشهر',
    photoKey: null,
    rank: null,
    score: null,
    total: null,
    ...extra,
  });

  it('groups by Cairo day and leaves a round still being filled for later', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const rounds = honorRounds(
      [
        entry('2026-10-19T08:00:00Z', 'أحمد محمد'),
        entry('2026-10-19T09:00:00Z', 'سارة علي'),
        // Cairo is UTC+3: 22:30 UTC on the 19th is the 20th in Cairo.
        entry('2026-10-19T22:30:00Z', 'منى خالد'),
        entry('2026-10-20T11:30:00Z', 'يوسف سيد'),
      ],
      now,
    );
    // The 20th's newest name is 30 minutes old — not settled.
    expect(rounds.map((round) => round.day)).toEqual(['2026-10-19']);
    expect(rounds[0]!.facts.people.map((p) => p.name)).toEqual(['أحمد م.', 'سارة ع.']);
  });

  it('orders placed ranks first, then marks; five at most; keeps the board photo', () => {
    const at = '2026-10-10T08:00:00Z';
    const rounds = honorRounds(
      [
        entry(at, 'هالة سمير', { score: 19, total: 20 }),
        entry(at, 'كريم وليد', { rank: 2 }),
        entry(at, 'نور حسن', { rank: 1, photoKey: 'ab/photo.webp' }),
        entry(at, 'ليلى عمر', { score: 20, total: 20 }),
        entry(at, 'زياد طارق', { score: 10, total: 20 }),
        entry(at, 'رنا فؤاد', { score: 5, total: 20 }),
      ],
      new Date('2026-10-12T00:00:00Z'),
    );
    const people = rounds[0]!.facts.people;
    expect(people.map((p) => p.name)).toEqual(['نور ح.', 'كريم و.', 'ليلى ع.', 'هالة س.', 'زياد ط.']);
    expect(people[0]!.photoKey).toBe('ab/photo.webp');
  });
});

describe('certificatesFacts', () => {
  it('totals the week, ranks the units, and names each student once', () => {
    const facts = certificatesFacts('2026-10-17', [
      { userId: 'a', fullName: 'أحمد محمد', title: 'الوحدة الأولى' },
      { userId: 'a', fullName: 'أحمد محمد', title: 'الوحدة التانية' },
      { userId: 'b', fullName: 'سارة علي', title: 'الوحدة الأولى' },
    ])!;
    expect(facts.total).toBe(3);
    expect(facts.units).toEqual([
      { title: 'الوحدة الأولى', count: 2 },
      { title: 'الوحدة التانية', count: 1 },
    ]);
    expect(facts.people.map((p) => p.name)).toEqual(['أحمد م.', 'سارة ع.']);
  });

  it('is nothing for a week with no certificates', () => {
    expect(certificatesFacts('2026-10-17', [])).toBeNull();
  });
});

describe('newsPath', () => {
  it('encodes an Arabic slug once', () => {
    expect(newsPath('مواعيد-الامتحانات')).toBe(`/news/${encodeURIComponent('مواعيد-الامتحانات')}`);
  });
});
