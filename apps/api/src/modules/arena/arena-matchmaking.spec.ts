import { cairoDayStart, pickPair, pickQuestions, queueKeyOf } from './arena-matchmaking';

describe('queueKeyOf — one queue per course and per cohort', () => {
  const base = { systemId: 's1', year: 2, stream: 'general' as const };

  it('separates the streams, the years, the systems and the courses', () => {
    const key = queueKeyOf('c1', base);
    expect(queueKeyOf('c1', { ...base, stream: 'languages' })).not.toBe(key);
    expect(queueKeyOf('c1', { ...base, year: 3 })).not.toBe(key);
    expect(queueKeyOf('c1', { ...base, systemId: 's2' })).not.toBe(key);
    expect(queueKeyOf('c2', base)).not.toBe(key);
    expect(queueKeyOf('c1', { ...base })).toBe(key);
  });

  it('keeps an unknown system or stream in a queue of its own', () => {
    expect(queueKeyOf('c1', { ...base, stream: null })).not.toBe(queueKeyOf('c1', base));
    expect(queueKeyOf('c1', { ...base, systemId: null })).not.toBe(queueKeyOf('c1', base));
  });
});

describe('pickPair', () => {
  const everyone = () => true;

  it('pairs the two who have waited longest', () => {
    const { pair } = pickPair(
      [
        { userId: 'c', since: 30 },
        { userId: 'a', since: 10 },
        { userId: 'b', since: 20 },
      ],
      everyone,
    );
    expect(pair?.map((m) => m.userId)).toEqual(['a', 'b']);
  });

  it('never pairs a student with themselves', () => {
    expect(pickPair([{ userId: 'a', since: 1 }, { userId: 'a', since: 2 }], everyone).pair).toBeNull();
    expect(pickPair([{ userId: 'a', since: 1 }], everyone).pair).toBeNull();
  });

  it('skips and reports whoever stopped sending a heartbeat', () => {
    const result = pickPair(
      [
        { userId: 'ghost', since: 1 },
        { userId: 'a', since: 2 },
        { userId: 'b', since: 3 },
      ],
      (id) => id !== 'ghost',
    );
    expect(result.stale).toEqual(['ghost']);
    expect(result.pair?.map((m) => m.userId)).toEqual(['a', 'b']);
  });
});

describe('pickQuestions', () => {
  const item = (id: string, facility: number | null = null) => ({ versionId: id, facility });
  const firstAlways = () => 0;

  it('prefers what both students have in their bank, then fills from either', () => {
    const picked = pickQuestions(
      [item('shared1'), item('shared2'), item('onlyA')],
      [item('shared1'), item('shared2'), item('onlyB')],
      3,
      firstAlways,
    ).map((q) => q.versionId);
    expect(picked).toHaveLength(3);
    expect(picked).toEqual(expect.arrayContaining(['shared1', 'shared2']));
  });

  it('never repeats a question and never goes past the count', () => {
    const a = Array.from({ length: 10 }, (_, i) => item(`q${i}`));
    const picked = pickQuestions(a, a, 7).map((q) => q.versionId);
    expect(picked).toHaveLength(7);
    expect(new Set(picked).size).toBe(7);
  });

  it('orders the match from the easiest to the hardest', () => {
    const picked = pickQuestions([item('hard', 0.2), item('easy', 0.9), item('mid', 0.5)], [], 3);
    expect(picked.map((q) => q.versionId)).toEqual(['easy', 'mid', 'hard']);
  });
});

describe('cairoDayStart', () => {
  it('starts the day at Cairo midnight, not UTC midnight', () => {
    // ٣٠ سبتمبر الساعة ١ الصبح بتوقيت القاهرة (UTC+3 صيفي) = ٢٩ الساعة ١٠ بالليل UTC.
    const start = cairoDayStart(new Date('2026-09-29T22:00:00Z'));
    expect(start.toISOString()).toBe('2026-09-29T21:00:00.000Z');
  });

  it('is the same instant all day long', () => {
    const morning = cairoDayStart(new Date('2026-09-30T06:00:00Z'));
    const night = cairoDayStart(new Date('2026-09-30T20:59:00Z'));
    expect(morning.getTime()).toBe(night.getTime());
  });
});
