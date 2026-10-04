import { describe, expect, it } from 'vitest';
import { LIMIT_PER_MINUTE, createFloodGuard, floodGuardIp } from './flood-guard';

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('flood guard', () => {
  it('refuses an anonymous address past the limit, and only past it', () => {
    const c = clock();
    const guard = createFloodGuard(3, c.now, () => {});
    const hits = Array.from({ length: 5 }, () => guard.shouldReject('1.2.3.4', true, '/'));
    expect(hits).toEqual([false, false, false, true, true]);
  });

  it('lets the address back in when the minute ends', () => {
    const c = clock();
    const guard = createFloodGuard(1, c.now, () => {});
    guard.shouldReject('1.2.3.4', true, '/');
    expect(guard.shouldReject('1.2.3.4', true, '/')).toBe(true);
    c.advance(60_000);
    expect(guard.shouldReject('1.2.3.4', true, '/')).toBe(false);
  });

  it('counts each address on its own', () => {
    const guard = createFloodGuard(1, clock().now, () => {});
    guard.shouldReject('1.1.1.1', true, '/');
    expect(guard.shouldReject('1.1.1.1', true, '/')).toBe(true);
    expect(guard.shouldReject('2.2.2.2', true, '/')).toBe(false);
  });

  // A whole class on one school connection, signed in, must never be refused.
  it('never counts a request with a session', () => {
    const guard = createFloodGuard(1, clock().now, () => {});
    for (let i = 0; i < 50; i += 1) expect(guard.shouldReject('1.2.3.4', false, '/')).toBe(false);
  });

  it('leaves /api/* to the API throttler', () => {
    const guard = createFloodGuard(1, clock().now, () => {});
    for (let i = 0; i < 50; i += 1) {
      expect(guard.shouldReject('1.2.3.4', true, '/api/session')).toBe(false);
    }
  });

  it('does nothing without the Cloudflare header (local, CI)', () => {
    const guard = createFloodGuard(1, clock().now, () => {});
    for (let i = 0; i < 50; i += 1) expect(guard.shouldReject(null, true, '/')).toBe(false);
  });

  it('logs an offender once per minute, not once per hit', () => {
    const lines: string[] = [];
    const guard = createFloodGuard(1, clock().now, (line) => lines.push(line));
    for (let i = 0; i < 20; i += 1) guard.shouldReject('1.2.3.4', true, '/');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('1.2.3.4');
  });

  // Both addresses from 2026-10-04 (six and ten a second) must be refused;
  // a CGNAT crowd reading pages must not.
  it('sits between a crowd of humans and the bots that took the server down', () => {
    expect(LIMIT_PER_MINUTE).toBeLessThan(6 * 60);
    expect(LIMIT_PER_MINUTE).toBeGreaterThanOrEqual(60);
  });

  it('reads the address from cf-connecting-ip only', () => {
    expect(floodGuardIp(new Headers({ 'cf-connecting-ip': ' 9.9.9.9 ' }))).toBe('9.9.9.9');
    expect(floodGuardIp(new Headers({ 'x-forwarded-for': '9.9.9.9' }))).toBeNull();
  });
});
