import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `public/sw.js`'s cache bookkeeping, exercised against a fake Cache Storage.
 *
 * ## Why this file exists at all
 *
 * The worker now names its cache after the BUILD that registered it, so what
 * used to be one cache for the life of the install is one per deploy. Two rules
 * keep that from being a regression, and both are invisible when wrong:
 *
 *   · a build somebody is still running must never be purged — deleting it
 *     strands that tab, because the container that could re-serve those chunks
 *     has already been replaced;
 *   · caches must not accumulate one per deploy — `MAX_ASSET_ENTRIES` bounds
 *     each cache and says nothing about how many there are, and the failure it
 *     was written to prevent (the browser evicting the whole origin, offline
 *     page included) comes back through the count instead of the size.
 *
 * Neither shows up in a browser until a student has slept through several
 * deploys with the app open, which is the case nobody tests by hand.
 *
 * ## Why it evaluates the file rather than importing it
 *
 * `sw.js` is a service worker: it reads `self.location`, calls
 * `self.addEventListener` at module scope, and is loaded by a browser with no
 * transform step (which is why it is `.js` and not `.ts`). It has no exports.
 * So this compiles it once inside a `Function` with a fake `self` and `caches`,
 * and drives the two lifecycle handlers it registered — the same shape
 * `cache-handler/redis.test.ts` uses to test that other untransformed file.
 */

const SW_SOURCE = readFileSync(
  path.join(import.meta.dirname, '..', 'public', 'sw.js'),
  'utf8',
);

/**
 * The subset of the Cache Storage API `sw.js` touches, with real per-cache
 * CONTENTS — the carry-over on `activate` is about which entries survive, not
 * only which names do.
 */
function fakeCaches(initial: Record<string, string[]> | string[]) {
  const stores = new Map<string, Map<string, { url: string }>>();
  const seed = Array.isArray(initial)
    ? Object.fromEntries(initial.map((name) => [name, [] as string[]]))
    : initial;
  for (const [name, urls] of Object.entries(seed)) {
    stores.set(name, new Map(urls.map((url) => [url, { url }])));
  }

  function open(name: string) {
    let store = stores.get(name);
    if (!store) stores.set(name, (store = new Map()));
    return {
      add: (request: { url: string }) => {
        store!.set(request.url, request);
        return Promise.resolve();
      },
      keys: () => Promise.resolve([...store!.values()]),
      match: (request: { url: string }) => Promise.resolve(store!.get(request.url)),
      put: (request: { url: string }, response: unknown) => {
        store!.set(request.url, request);
        void response;
        return Promise.resolve();
      },
      delete: (request: { url: string }) => Promise.resolve(store!.delete(request.url)),
    };
  }

  return {
    get names() {
      return new Set(stores.keys());
    },
    urlsIn: (name: string) => [...(stores.get(name)?.keys() ?? [])],
    api: {
      keys: () => Promise.resolve([...stores.keys()]),
      delete: (name: string) => Promise.resolve(stores.delete(name)),
      open: (name: string) => Promise.resolve(open(name)),
      match: () => Promise.resolve(undefined),
    },
  };
}

type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;

/**
 * Evaluates `sw.js` against a fake worker global and returns the handlers it
 * registered, plus the fake cache storage to assert on.
 *
 * @param scriptUrl what the worker was registered as — the `?v=` in it is where
 *                  `VERSION` comes from.
 * @param activeScriptUrl the script URL of the worker currently in charge, or
 *                  `null` for a first install.
 */
function evaluateWorker({
  scriptUrl,
  activeScriptUrl,
  existingCaches,
}: {
  scriptUrl: string;
  activeScriptUrl: string | null;
  existingCaches: Record<string, string[]> | string[];
}) {
  const listeners = new Map<string, Listener>();
  const caches = fakeCaches(existingCaches);

  const self = {
    location: { href: scriptUrl },
    registration: {
      active: activeScriptUrl ? { scriptURL: activeScriptUrl } : null,
    },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]) },
    setTimeout: (fn: () => void) => fn(),
  };

  /*
   * ⚠️ `new Function` over a string, and the string is `public/sw.js` read off
   * disk in this repo — not input, not interpolated, and not reachable from a
   * request. It is how an untransformed worker file gets evaluated at all; the
   * alternative is not testing the two rules above.
   *
   * `self` and `caches` are the only globals the file reaches for at module
   * scope and in the two lifecycle handlers. `Request` is stubbed because
   * `install` precaches through `new Request('/offline')` and Node's real
   * `Request` rejects a relative URL — a browser resolves it against the
   * worker's scope, which there is no way to express here. `fetch` is reached
   * only inside the fetch handler, which these tests never fire.
   */
  class Request {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
  }
  new Function(
    'self',
    'caches',
    'fetch',
    'Request',
    SW_SOURCE,
  )(self, caches.api, vi.fn(), Request);

  async function fire(type: 'install' | 'activate') {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`sw.js registered no ${type} listener`);
    const pending: Promise<unknown>[] = [];
    listener({ waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
  }

  return { fire, caches };
}

const OLD = 'https://aymanaboelela.com/sw.js?v=b20260901000000';
const NEW = 'https://aymanaboelela.com/sw.js?v=b20260908000000';

let worker: ReturnType<typeof evaluateWorker>;

describe('sw.js cache versioning', () => {
  it('names its cache after the build in its own script URL', async () => {
    worker = evaluateWorker({ scriptUrl: NEW, activeScriptUrl: null, existingCaches: [] });
    await worker.fire('install');

    expect(worker.caches.names.has('ayman-static-b20260908000000')).toBe(true);
  });

  it('falls back to the hand-bumped version when there is no token', async () => {
    // `next dev`, and any device whose registration predates the `?v=` query.
    // Both must behave exactly as the worker did before: one cache name.
    worker = evaluateWorker({
      scriptUrl: 'http://localhost:3200/sw.js',
      activeScriptUrl: null,
      existingCaches: [],
    });
    await worker.fire('install');

    expect(worker.caches.names.has('ayman-static-v4')).toBe(true);
  });

  describe('install-time purge', () => {
    beforeEach(() => {
      // The pathological case the whole thing is about: a student who has not
      // closed the app across several deploys. The worker in charge is the
      // SECOND of these, not the newest — that is the point.
      worker = evaluateWorker({
        scriptUrl: NEW,
        activeScriptUrl: OLD,
        existingCaches: [
          'ayman-static-v4',
          'ayman-static-b20260820000000',
          'ayman-static-b20260825000000',
          'ayman-static-b20260901000000',
        ],
      });
    });

    it('keeps the build the open tab is still running', async () => {
      // Deleting this one strands that tab: its chunks are gone from the device
      // at the same moment the container that served them was replaced.
      await worker.fire('install');

      expect(worker.caches.names.has('ayman-static-b20260901000000')).toBe(true);
    });

    it('keeps the build it is about to serve', async () => {
      await worker.fire('install');

      expect(worker.caches.names.has('ayman-static-b20260908000000')).toBe(true);
    });

    it('drops every other build without waiting for activate', async () => {
      // `activate` is the only other purge and it cannot run while that tab is
      // open — so without this, one cache per deploy accumulates forever.
      await worker.fire('install');

      expect([...worker.caches.names].sort()).toEqual([
        'ayman-static-b20260901000000',
        'ayman-static-b20260908000000',
      ]);
    });

    it('leaves caches that are not this worker’s alone', async () => {
      // Only the `ayman-static-` prefix is ours. Anything else on the origin —
      // a future cache, or one from a tool — is not this file's to delete.
      worker = evaluateWorker({
        scriptUrl: NEW,
        activeScriptUrl: OLD,
        existingCaches: ['ayman-static-b20260820000000', 'workbox-precache', 'something-else'],
      });
      await worker.fire('install');

      expect(worker.caches.names.has('workbox-precache')).toBe(true);
      expect(worker.caches.names.has('something-else')).toBe(true);
      expect(worker.caches.names.has('ayman-static-b20260820000000')).toBe(false);
    });
  });

  describe('handover on activate', () => {
    beforeEach(() => {
      // The window that makes this necessary: while the new worker WAITED, the
      // old one stayed in charge — so a tab opened after the deploy loaded the
      // NEW build's chunks and the OLD worker filed them under its own name.
      worker = evaluateWorker({
        scriptUrl: NEW,
        activeScriptUrl: NEW,
        existingCaches: {
          'ayman-static-b20260901000000': [
            'https://aymanaboelela.com/_next/static/chunks/old-build.js',
            'https://aymanaboelela.com/_next/static/chunks/new-build.js',
            'https://aymanaboelela.com/offline',
          ],
          'ayman-static-b20260908000000': [],
        },
      });
    });

    it('collapses to one cache once the old worker is released', async () => {
      await worker.fire('activate');

      expect([...worker.caches.names]).toEqual(['ayman-static-b20260908000000']);
    });

    it('carries the outgoing cache over instead of throwing it away', async () => {
      // Deleting it outright costs a full cold load of the JS and CSS after
      // every deploy — the same price `next.config.ts` rejects `deploymentId`
      // for. Everything is already on the device; this is cache-to-cache.
      await worker.fire('activate');

      expect(worker.caches.urlsIn('ayman-static-b20260908000000')).toEqual(
        expect.arrayContaining([
          'https://aymanaboelela.com/_next/static/chunks/new-build.js',
          'https://aymanaboelela.com/_next/static/chunks/old-build.js',
        ]),
      );
    });

    it('does not carry PRECACHE over — install has already written it fresh', async () => {
      await worker.fire('install');
      await worker.fire('activate');

      // The offline page in the new cache is the one `install` fetched with
      // `cache: 'reload'`, not a copy of a stale one.
      expect(worker.caches.urlsIn('ayman-static-b20260908000000')).not.toContain(
        'https://aymanaboelela.com/offline',
      );
    });
  });
});
