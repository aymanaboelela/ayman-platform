import { trackerFromRequest } from './request-identity';

describe('trackerFromRequest', () => {
  it('keys two students behind one NAT separately', () => {
    const shared = '41.33.0.1';
    const a = trackerFromRequest({ ip: shared, headers: { cookie: 'session_token=aaa.sig' } });
    const b = trackerFromRequest({ ip: shared, headers: { cookie: 'session_token=bbb.sig' } });

    expect(a).not.toBe(b);
  });

  it('keys one student across networks into a single bucket', () => {
    const first = trackerFromRequest({ ip: '41.33.0.1', headers: { cookie: 'session_token=aaa.sig' } });
    const second = trackerFromRequest({ ip: '197.1.2.3', headers: { cookie: 'session_token=aaa.sig' } });

    // Same session, different network (wifi → mobile data) — still one bucket.
    expect(first).toBe(second);
  });

  it('never puts a raw session token in the key', () => {
    const tracker = trackerFromRequest({
      ip: '41.33.0.1',
      headers: { cookie: 'session_token=super-secret-value.sig' },
    });

    // Tracker keys end up in logs and in the throttler store. A raw session
    // token in either is a session-hijacking primitive.
    expect(tracker).not.toContain('super-secret-value');
    expect(tracker.startsWith('sess:')).toBe(true);
  });

  it('reads the production __Host- prefixed cookie too', () => {
    const prefixed = trackerFromRequest({
      ip: '41.33.0.1',
      headers: { cookie: '__Host-session_token=aaa.sig' },
    });
    const plain = trackerFromRequest({
      ip: '41.33.0.1',
      headers: { cookie: 'session_token=aaa.sig' },
    });

    expect(prefixed).toBe(plain);
  });

  it('falls back to the IP when there is no session at all', () => {
    expect(trackerFromRequest({ ip: '41.33.0.1', headers: {} })).toBe('ip:41.33.0.1');
  });

  it('falls back to a constant when even the IP is missing, rather than to undefined', () => {
    // An undefined tracker would collapse every anonymous request into one
    // key silently; making it explicit means the behaviour is a decision.
    expect(trackerFromRequest({ headers: {} })).toBe('ip:unknown');
  });

  it('is not confused by another cookie whose name ends in session_token', () => {
    const decoy = trackerFromRequest({
      ip: '41.33.0.1',
      headers: { cookie: 'not_the_session_token=aaa; other=1' },
    });
    expect(decoy).toBe('ip:41.33.0.1');
  });
});
