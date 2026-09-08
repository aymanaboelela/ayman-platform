import { ipTrackerFromRequest, trackerFromRequest } from './request-identity';

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

  /**
   * The Flutter apps send `Authorization: Bearer <token>` and NO cookie.
   *
   * Without this branch every signed-in mobile student fell through to the IP
   * bucket, and Egyptian mobile data is carrier-NATed hard enough that one
   * operator's students would have shared a single 10/s allowance.
   */
  describe('bearer sessions (the native apps)', () => {
    it('gives a bearer token its own bucket instead of the shared IP one', () => {
      const key = trackerFromRequest({
        ip: '41.35.1.2',
        headers: { authorization: 'Bearer abc.def' },
      });

      expect(key.startsWith('sess:')).toBe(true);
      expect(key).not.toBe('ip:41.35.1.2');
    });

    it('separates two students behind the same carrier NAT', () => {
      const one = trackerFromRequest({
        ip: '41.35.1.2',
        headers: { authorization: 'Bearer student-one' },
      });
      const two = trackerFromRequest({
        ip: '41.35.1.2',
        headers: { authorization: 'Bearer student-two' },
      });

      expect(one).not.toBe(two);
    });

    it('is stable for the same token', () => {
      const headers = { authorization: 'Bearer abc.def' };

      expect(trackerFromRequest({ ip: '1.1.1.1', headers })).toBe(
        trackerFromRequest({ ip: '2.2.2.2', headers }),
      );
    });

    it('accepts a lowercase scheme', () => {
      // RFC 9110 §11.1 makes the scheme token case-insensitive. A
      // `startsWith('Bearer ')` would pass every test written against Dio and
      // then silently drop a client that spells it `bearer`.
      expect(
        trackerFromRequest({ ip: '1.1.1.1', headers: { authorization: 'bearer abc.def' } }),
      ).toBe(trackerFromRequest({ ip: '1.1.1.1', headers: { authorization: 'Bearer abc.def' } }));
    });

    it('never puts the raw token in the key', () => {
      const key = trackerFromRequest({
        ip: '1.1.1.1',
        headers: { authorization: 'Bearer super-secret-session-token' },
      });

      // Tracker keys reach the throttler store and, on a miss, the logs.
      expect(key).not.toContain('super-secret-session-token');
    });

    it('prefers the cookie when a client somehow sends both', () => {
      // Only a browser-shaped client can produce this, and for that client the
      // cookie is the identity the rest of the stack already agreed on.
      expect(
        trackerFromRequest({
          ip: '1.1.1.1',
          headers: {
            cookie: '__Host-session_token=from-cookie',
            authorization: 'Bearer from-header',
          },
        }),
      ).toBe(
        trackerFromRequest({
          ip: '1.1.1.1',
          headers: { cookie: '__Host-session_token=from-cookie' },
        }),
      );
    });

    it('ignores a header that is not a bearer credential', () => {
      // `Basic` and a bare `Bearer` with nothing after it are not sessions;
      // hashing them would mint one shared bucket for every malformed request.
      expect(
        trackerFromRequest({ ip: '41.35.1.2', headers: { authorization: 'Basic dXNlcjpwdw==' } }),
      ).toBe('ip:41.35.1.2');
      expect(trackerFromRequest({ ip: '41.35.1.2', headers: { authorization: 'Bearer ' } })).toBe(
        'ip:41.35.1.2',
      );
    });
  });
});

/**
 * The ceiling the session key cannot provide.
 *
 * `trackerFromRequest` hashes the session cookie WITHOUT validating it, so a
 * client that changes the cookie per request mints a fresh bucket and the limits
 * become decorative. These tests pin the property that fixes it: whatever the
 * client puts in a cookie, the IP tracker does not move.
 */
describe('ipTrackerFromRequest — the bucket a client cannot opt out of', () => {
  it('ignores the session cookie entirely', () => {
    // The exact bypass: same address, a different forged cookie each time.
    const a = ipTrackerFromRequest({
      ip: '1.2.3.4',
      headers: { cookie: '__Host-session_token=forged-one' },
    });
    const b = ipTrackerFromRequest({
      ip: '1.2.3.4',
      headers: { cookie: '__Host-session_token=forged-two' },
    });

    expect(a).toBe(b);
    // …and the session tracker demonstrably DOES move, which is the whole
    // reason this second tracker had to exist.
    expect(trackerFromRequest({ ip: '1.2.3.4', headers: { cookie: '__Host-session_token=forged-one' } })).not.toBe(
      trackerFromRequest({ ip: '1.2.3.4', headers: { cookie: '__Host-session_token=forged-two' } }),
    );
  });

  it('prefers cf-connecting-ip over Express’s idea of the address', () => {
    // `trust proxy` is 1 and production has two hops, so `request.ip` is a
    // Cloudflare edge address — shared by every student on that PoP. Keying a
    // ceiling on it would throttle a whole region together.
    expect(
      ipTrackerFromRequest({ ip: '172.16.0.1', headers: { 'cf-connecting-ip': '41.35.1.2' } }),
    ).toBe('ip:41.35.1.2');
  });

  it('falls back to request.ip when the header is absent', () => {
    expect(ipTrackerFromRequest({ ip: '41.35.1.2', headers: {} })).toBe('ip:41.35.1.2');
  });

  it('separates two different clients', () => {
    expect(ipTrackerFromRequest({ ip: '1.1.1.1' })).not.toBe(ipTrackerFromRequest({ ip: '2.2.2.2' }));
  });

  it('never returns an empty or undefined-shaped key', () => {
    // An undefined tracker silently merges every such request into one bucket,
    // which is the failure mode the `unknown` literal exists to make visible.
    expect(ipTrackerFromRequest({})).toBe('ip:unknown');
    expect(ipTrackerFromRequest({ ip: '1.1.1.1', headers: { 'cf-connecting-ip': '   ' } })).toBe(
      'ip:1.1.1.1',
    );
  });

  it('takes the first value when the header arrives more than once', () => {
    expect(
      ipTrackerFromRequest({ ip: '9.9.9.9', headers: { 'cf-connecting-ip': ['41.35.1.2', '5.5.5.5'] } }),
    ).toBe('ip:41.35.1.2');
  });
});
