import { GENESIS_HASH, canonicalise, chainHash } from './chain';

const payload = {
  action: 'settings:update',
  resourceType: 'site_settings',
  resourceId: '1',
  outcome: 'success',
  actorUserId: 'user_1',
  occurredAt: '2026-07-26T10:00:00.000Z',
  metadata: { key: 'branding', accent: 'amber' },
};

describe('canonicalise', () => {
  it('is independent of key insertion order', () => {
    expect(canonicalise({ a: 1, b: 2 })).toBe(canonicalise({ b: 2, a: 1 }));
  });

  it('recurses into nested objects', () => {
    expect(canonicalise({ x: { p: 1, q: 2 } })).toBe(canonicalise({ x: { q: 2, p: 1 } }));
  });

  it('preserves array order, which IS meaningful', () => {
    expect(canonicalise([1, 2])).not.toBe(canonicalise([2, 1]));
  });

  it('distinguishes null from undefined-shaped absence', () => {
    expect(canonicalise({ a: null })).not.toBe(canonicalise({}));
  });

  /**
   * Regression: `PaymentsService.approve` once passed a raw `validUntil`
   * Date straight into `metadata`. `Object.entries(new Date())` is `[]`, so
   * without this case a Date canonicalises as `{}` — while Prisma's own JSON
   * encoder stores `Date.prototype.toJSON()`'s ISO string on the actual row.
   * `verifyChain` recomputes from what was STORED, so that row's hash would
   * never again match what was computed at write time.
   */
  it('hashes a bare Date the same way Prisma will store it — as its ISO string, not `{}`', () => {
    const date = new Date('2026-09-25T17:47:25.882Z');
    expect(canonicalise({ validUntil: date })).toBe(
      canonicalise({ validUntil: date.toISOString() }),
    );
    expect(canonicalise({ validUntil: date })).not.toBe(canonicalise({ validUntil: {} }));
  });
});

describe('chainHash', () => {
  it('is deterministic', () => {
    expect(chainHash(GENESIS_HASH, payload)).toBe(chainHash(GENESIS_HASH, payload));
  });

  it('is 64 lowercase hex characters', () => {
    expect(chainHash(GENESIS_HASH, payload)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the previous hash changes — this is what makes it a CHAIN', () => {
    const a = chainHash(GENESIS_HASH, payload);
    const b = chainHash('f'.repeat(64), payload);
    expect(a).not.toBe(b);
  });

  it('changes when any payload field changes', () => {
    const base = chainHash(GENESIS_HASH, payload);
    expect(chainHash(GENESIS_HASH, { ...payload, outcome: 'failure' })).not.toBe(base);
    expect(
      chainHash(GENESIS_HASH, { ...payload, metadata: { key: 'branding', accent: 'cyan' } }),
    ).not.toBe(base);
  });

  it('is unaffected by payload key order', () => {
    const reordered = {
      metadata: payload.metadata,
      occurredAt: payload.occurredAt,
      actorUserId: payload.actorUserId,
      outcome: payload.outcome,
      resourceId: payload.resourceId,
      resourceType: payload.resourceType,
      action: payload.action,
    };
    expect(chainHash(GENESIS_HASH, reordered)).toBe(chainHash(GENESIS_HASH, payload));
  });
});
