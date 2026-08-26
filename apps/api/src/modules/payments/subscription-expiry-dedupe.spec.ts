import { needsExpiryNotice } from './subscription-expiry-dedupe';

describe('needsExpiryNotice', () => {
  it('keeps a candidate nobody was ever notified about', () => {
    const result = needsExpiryNotice(
      [{ userId: 'u1', courseId: 'c1', validUntil: '2026-07-01T00:00:00.000Z' }],
      [],
    );
    expect(result).toHaveLength(1);
  });

  it('drops a candidate already notified about at the SAME validUntil', () => {
    const result = needsExpiryNotice(
      [{ userId: 'u1', courseId: 'c1', validUntil: '2026-07-01T00:00:00.000Z' }],
      [{ userId: 'u1', courseId: 'c1', validUntil: '2026-07-01T00:00:00.000Z' }],
    );
    expect(result).toHaveLength(0);
  });

  it('keeps a candidate whose validUntil moved — a renewal is a fresh term', () => {
    const result = needsExpiryNotice(
      [{ userId: 'u1', courseId: 'c1', validUntil: '2026-08-01T00:00:00.000Z' }],
      [{ userId: 'u1', courseId: 'c1', validUntil: '2026-07-01T00:00:00.000Z' }],
    );
    expect(result).toHaveLength(1);
  });

  it('never lets one student/course pair suppress another', () => {
    const candidates = [
      { userId: 'u1', courseId: 'c1', validUntil: '2026-07-01T00:00:00.000Z' },
      { userId: 'u1', courseId: 'c2', validUntil: '2026-07-01T00:00:00.000Z' },
      { userId: 'u2', courseId: 'c1', validUntil: '2026-07-01T00:00:00.000Z' },
    ];
    const result = needsExpiryNotice(candidates, [
      { userId: 'u1', courseId: 'c1', validUntil: '2026-07-01T00:00:00.000Z' },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((c) => `${c.userId}:${c.courseId}`).sort()).toEqual(['u1:c2', 'u2:c1']);
  });

  it('is a no-op on an empty candidate list', () => {
    expect(needsExpiryNotice([], [{ userId: 'u1', courseId: 'c1', validUntil: 'x' }])).toEqual([]);
  });
});
