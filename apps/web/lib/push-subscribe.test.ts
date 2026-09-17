import { describe, expect, it, vi, afterEach } from 'vitest';
import { ensurePushSubscribed, subscribeToPush, urlBase64ToUint8Array } from './push-subscribe';

describe('urlBase64ToUint8Array', () => {
  it('round-trips a VAPID public key through btoa/atob', () => {
    // A real `generateVAPIDKeys()` public key: 65 raw bytes, base64url with no
    // padding — the exact shape `web-push` hands the client.
    const raw = new Uint8Array(65).map((_, i) => i);
    const base64Url = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    expect(Array.from(urlBase64ToUint8Array(base64Url))).toEqual(Array.from(raw));
  });

  it('handles a string that needs no padding restored', () => {
    // 4-char-aligned base64url ("AAAA" = 3 zero bytes) needs zero '=' added —
    // the padding formula must not choke on a length already divisible by 4.
    expect(Array.from(urlBase64ToUint8Array('AAAA'))).toEqual([0, 0, 0]);
  });
});

describe('subscribeToPush', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      // @ts-expect-error — jsdom does not define it by default.
      delete navigator.serviceWorker;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is a silent no-op when the Push API does not exist in this browser', async () => {
    // @ts-expect-error — simulating a browser with no serviceWorker support.
    delete navigator.serviceWorker;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(subscribeToPush()).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('REPORTS not_configured when the API has no VAPID key — it must not read as success', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({}) },
    });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ publicKey: null }), { status: 200 }),
      ),
    );

    /*
     * The bug this assertion exists for. Returning `undefined` here was
     * indistinguishable from a successful subscribe, so an unconfigured
     * deployment produced a granted permission, no subscription, and a hidden
     * button — with nothing anywhere saying why.
     */
    await expect(subscribeToPush()).resolves.toEqual({ ok: false, reason: 'not_configured' });
  });

  it('subscribes and posts only endpoint/keys, dropping expirationTime', async () => {
    const subscribe = vi.fn().mockResolvedValue({
      toJSON: () => ({
        endpoint: 'https://push.example/abc',
        expirationTime: 1234567890,
        keys: { p256dh: 'p256', auth: 'auth' },
      }),
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe },
        }),
      },
    });
    vi.stubGlobal('PushManager', class {});
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('public-key')) {
        return Promise.resolve(
          new Response(JSON.stringify({ publicKey: 'AAAA' }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await subscribeToPush();

    const subscribeCall = fetchMock.mock.calls.find((call: unknown[]) =>
      (call[0] as string).includes('/push/subscribe'),
    );
    expect(subscribeCall).toBeDefined();
    const body = JSON.parse((subscribeCall![1] as RequestInit).body as string);
    expect(body).toEqual({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p256', auth: 'auth' } });
  });
});

/**
 * The mount-time repair. These are the cases that decide whether someone who
 * granted the permission BEFORE the server had keys can ever recover — the
 * bell that would otherwise re-subscribe them is hidden by that same grant.
 */
describe('ensurePushSubscribed', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

  /** This jsdom build exposes `window.localStorage` without working methods,
   *  so the real storage is substituted per test rather than assumed. */
  function stubStorage(seed?: Record<string, string>) {
    const store = new Map<string, string>(Object.entries(seed ?? {}));
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  }

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      // @ts-expect-error — jsdom does not define it by default.
      delete navigator.serviceWorker;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does nothing, and asks the network nothing, when permission was never granted', async () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await ensurePushSubscribed();

    // The bell is still rendered in this state and is what should ask. A
    // silent repair must never be the thing that raises a prompt.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does nothing when permission was refused', async () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await ensurePushSubscribed();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('SUBSCRIBES a granted browser that holds no subscription — the stuck admin', async () => {
    // Exactly the production state: permission granted long ago, the subscribe
    // that followed it silently failed for want of a VAPID key, and the bell
    // has been hidden ever since.
    stubStorage();
    const subscribe = vi.fn().mockResolvedValue({
      toJSON: () => ({
        endpoint: 'https://push.example/healed',
        keys: { p256dh: 'p256', auth: 'auth' },
      }),
    });
    vi.stubGlobal('Notification', { permission: 'granted' });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe },
        }),
      },
    });
    vi.stubGlobal('PushManager', class {});
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      url.includes('public-key')
        ? Promise.resolve(new Response(JSON.stringify({ publicKey: 'AAAA' }), { status: 200 }))
        : Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensurePushSubscribed()).resolves.toEqual({ ok: true });
    expect(subscribe).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some((call: unknown[]) =>
        (call[0] as string).includes('/push/subscribe'),
      ),
    ).toBe(true);
  });

  it('costs nothing once the endpoint it already registered is still the live one', async () => {
    // The steady state, and the reason this may run on every signed-in page
    // load: no key fetch, no upsert, no subscribe call.
    stubStorage({ 'ayman:push:synced-endpoint': 'https://push.example/known' });
    const subscribe = vi.fn();
    vi.stubGlobal('Notification', { permission: 'granted' });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://push.example/known' }),
            subscribe,
          },
        }),
      },
    });
    vi.stubGlobal('PushManager', class {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(ensurePushSubscribed()).resolves.toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('re-registers when the browser rotated the endpoint behind us', async () => {
    stubStorage({ 'ayman:push:synced-endpoint': 'https://push.example/old' });
    vi.stubGlobal('Notification', { permission: 'granted' });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({
              endpoint: 'https://push.example/new',
              toJSON: () => ({
                endpoint: 'https://push.example/new',
                keys: { p256dh: 'p256', auth: 'auth' },
              }),
            }),
            subscribe: vi.fn(),
          },
        }),
      },
    });
    vi.stubGlobal('PushManager', class {});
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      url.includes('public-key')
        ? Promise.resolve(new Response(JSON.stringify({ publicKey: 'AAAA' }), { status: 200 }))
        : Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensurePushSubscribed()).resolves.toEqual({ ok: true });
    const posted = fetchMock.mock.calls.find((call: unknown[]) =>
      (call[0] as string).includes('/push/subscribe'),
    );
    expect(JSON.parse((posted![1] as RequestInit).body as string).endpoint).toBe(
      'https://push.example/new',
    );
  });

  it('still reports not_configured on a granted browser when the server has no key', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() },
        }),
      },
    });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ publicKey: null }), { status: 200 })),
    );

    await expect(ensurePushSubscribed()).resolves.toEqual({ ok: false, reason: 'not_configured' });
  });
});
