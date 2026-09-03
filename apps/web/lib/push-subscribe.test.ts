import { describe, expect, it, vi, afterEach } from 'vitest';
import { subscribeToPush, urlBase64ToUint8Array } from './push-subscribe';

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

    await expect(subscribeToPush()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is a silent no-op when the API reports no configured VAPID key', async () => {
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

    await expect(subscribeToPush()).resolves.toBeUndefined();
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
