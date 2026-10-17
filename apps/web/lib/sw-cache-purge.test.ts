import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * `public/sw.js`'s cache bookkeeping, exercised against a fake Cache Storage.
 *
 * ## What has to hold
 *
 * The worker names its cache after the BUILD that registered it, takes over as
 * soon as it installs, and deletes a previous build's cache once no open tab is
 * running that build («لو فيها كاش من البلدات القديمة تتمسح»). Three rules keep
 * that from being a regression, and all three are invisible when wrong:
 *
 *   · a build an open tab is still running must never be purged — deleting it
 *     strands that tab's lazy chunks, because the container that could
 *     re-serve them has already been replaced;
 *   · an old build's dead chunks must not ride forward into the new cache —
 *     only what a page on the current build actually uses is copied;
 *   · the offline page must survive every handover.
 *
 * ## Why it evaluates the file rather than importing it
 *
 * `sw.js` is a service worker: it reads `self.location`, calls
 * `self.addEventListener` at module scope, and is loaded by a browser with no
 * transform step (which is why it is `.js` and not `.ts`). It has no exports.
 * So this compiles it inside a `Function` with a fake `self` and `caches`, and
 * drives the handlers it registered — the same shape
 * `cache-handler/redis.test.ts` uses for that other untransformed file.
 */

const SW_SOURCE = readFileSync(path.join(import.meta.dirname, '..', 'public', 'sw.js'), 'utf8');

const ORIGIN = 'https://example.test';
const OLD = `${ORIGIN}/sw.js?v=b20260901000000`;
const NEW = `${ORIGIN}/sw.js?v=b20260908000000`;
const OLD_CACHE = 'ayman-static-b20260901000000';
const NEW_CACHE = 'ayman-static-b20260908000000';
const asset = (name: string) => `${ORIGIN}/_next/static/chunks/${name}.js`;

/**
 * The Cache Storage API as `sw.js` uses it, with real per-cache contents and a
 * fresh `Response` per read — the registry is JSON read back with `.json()`,
 * and a real cache never hands out a body that was already consumed.
 */
function fakeCaches(initial: Record<string, string[]>) {
  const stores = new Map<string, Map<string, string>>();
  for (const [name, urls] of Object.entries(initial)) {
    stores.set(name, new Map(urls.map((url) => [url, `body of ${url}`])));
  }
  const storeFor = (name: string) => {
    let store = stores.get(name);
    if (!store) stores.set(name, (store = new Map()));
    return store;
  };
  const open = (name: string) => {
    const store = storeFor(name);
    return {
      add: async (request: { url: string }) => void store.set(request.url, `body of ${request.url}`),
      keys: async () => [...store.keys()].map((url) => ({ url })),
      match: async (request: { url: string }) =>
        store.has(request.url) ? new Response(store.get(request.url)) : undefined,
      put: async (request: { url: string }, response: Response) =>
        void store.set(request.url, await response.text()),
      delete: async (request: { url: string }) => store.delete(request.url),
    };
  };

  return {
    names: () => [...stores.keys()],
    urlsIn: (name: string) => [...(stores.get(name)?.keys() ?? [])],
    api: {
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      open: async (name: string) => open(name),
      match: async (request: { url: string }) => {
        for (const store of stores.values()) {
          if (store.has(request.url)) return new Response(store.get(request.url));
        }
        return undefined;
      },
    },
  };
}

type Handler = (event: Record<string, unknown>) => void;

function evaluateWorker({
  scriptUrl,
  activeScriptUrl,
  existingCaches,
  openWindows = [],
}: {
  scriptUrl: string;
  activeScriptUrl: string | null;
  existingCaches: Record<string, string[]>;
  /** Ids of the windows `clients.matchAll` reports as open. */
  openWindows?: string[];
}) {
  const listeners = new Map<string, Handler>();
  const caches = fakeCaches(existingCaches);
  const windows = [...openWindows];
  const skipWaiting = vi.fn(async () => {});
  const claim = vi.fn(async () => {});
  const fetchMock = vi.fn(async (request: { url: string }) => new Response(`network ${request.url}`));

  const self = {
    location: new URL(scriptUrl),
    registration: { active: activeScriptUrl ? { scriptURL: activeScriptUrl } : null },
    addEventListener: (type: string, listener: Handler) => listeners.set(type, listener),
    skipWaiting,
    clients: { claim, matchAll: async () => windows.map((id) => ({ id })) },
    setTimeout: (fn: () => void) => fn(),
  };

  /*
   * ⚠️ `new Function` over a string, and the string is `public/sw.js` read off
   * disk in this repo — not input, not interpolated, and not reachable from a
   * request. It is how an untransformed worker file gets evaluated at all.
   *
   * `Request` is stubbed because the worker builds `new Request('/offline')`
   * and Node's real one rejects a relative URL; the stub resolves it against
   * the worker's scope exactly as a browser does — load-bearing, because the
   * worker reads `new URL(request.url).pathname`, which throws on a relative
   * URL and would send every entry down a `catch`.
   */
  class Request {
    url: string;
    constructor(url: string) {
      this.url = new URL(url, scriptUrl).href;
    }
  }
  new Function('self', 'caches', 'fetch', 'Request', 'Response', SW_SOURCE)(
    self,
    caches.api,
    fetchMock,
    Request,
    Response,
  );

  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`sw.js registered no ${type} listener`);
    const pending: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    listener({
      ...extra,
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      respondWith: (p: Promise<Response>) => (responded = p),
    });
    const response = responded ? await responded : undefined;
    // `waitUntil` can be called while the response itself resolves.
    for (let settled = 0; settled < pending.length; settled = pending.length) {
      await Promise.all(pending.slice(settled));
    }
    return response;
  }

  return {
    caches,
    windows,
    skipWaiting,
    claim,
    fetchMock,
    install: () => dispatch('install'),
    activate: () => dispatch('activate'),
    announce: (clientId: string, build: string, assets: string[] = []) =>
      dispatch('message', { data: { type: 'ayman:build', build, assets }, source: { id: clientId } }),
    fetchAsset: (url: string, clientId = '') =>
      dispatch('fetch', { request: { url, method: 'GET', mode: 'no-cors' }, clientId }),
  };
}

describe('sw.js — naming', () => {
  it('names its cache after the build in its own script URL', async () => {
    const worker = evaluateWorker({ scriptUrl: NEW, activeScriptUrl: null, existingCaches: {} });
    await worker.install();
    expect(worker.caches.names()).toContain(NEW_CACHE);
  });

  it('falls back to the hand-bumped version when there is no token', async () => {
    // `next dev`, and any device whose registration predates the `?v=` query.
    const worker = evaluateWorker({ scriptUrl: `${ORIGIN}/sw.js`, activeScriptUrl: null, existingCaches: {} });
    await worker.install();
    expect(worker.caches.names()).toContain('ayman-static-v4');
  });
});

describe('sw.js — taking over', () => {
  it('precaches the offline page and takes over at once, instead of waiting for every old tab', async () => {
    const worker = evaluateWorker({ scriptUrl: NEW, activeScriptUrl: OLD, existingCaches: {} });
    await worker.install();

    expect(worker.caches.urlsIn(NEW_CACHE)).toContain(`${ORIGIN}/offline`);
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('claims the tabs that are already open when it activates', async () => {
    const worker = evaluateWorker({ scriptUrl: NEW, activeScriptUrl: NEW, existingCaches: {} });
    await worker.activate();
    expect(worker.claim).toHaveBeenCalledTimes(1);
  });
});

describe('sw.js — old builds come off the device', () => {
  it('deletes every older build at once when no open tab runs one', async () => {
    const worker = evaluateWorker({
      scriptUrl: NEW,
      activeScriptUrl: OLD,
      existingCaches: {
        'ayman-static-v4': [],
        'ayman-static-b20260820000000': [asset('ancient')],
        [OLD_CACHE]: [asset('old-build')],
      },
    });
    await worker.install();
    await worker.activate();

    expect(worker.caches.names().filter((name) => name.startsWith('ayman-static-'))).toEqual([NEW_CACHE]);
  });

  it('never carries an old build’s chunks forward wholesale', async () => {
    // What the handover used to do: copy the whole outgoing cache into the
    // new one, dead chunks included, and leave them for the size cap.
    const worker = evaluateWorker({
      scriptUrl: NEW,
      activeScriptUrl: OLD,
      existingCaches: { [OLD_CACHE]: [asset('old-build')] },
    });
    await worker.install();
    await worker.activate();

    expect(worker.caches.urlsIn(NEW_CACHE)).not.toContain(asset('old-build'));
  });

  it('leaves caches that are not this worker’s alone', async () => {
    const worker = evaluateWorker({
      scriptUrl: NEW,
      activeScriptUrl: OLD,
      existingCaches: { [OLD_CACHE]: [], 'workbox-precache': [], 'something-else': [] },
    });
    await worker.install();
    await worker.activate();

    expect(worker.caches.names()).toEqual(
      expect.arrayContaining(['workbox-precache', 'something-else', NEW_CACHE]),
    );
    expect(worker.caches.names()).not.toContain(OLD_CACHE);
  });

  it('rescues the offline page when install could not fetch it', async () => {
    // Install's precache is `.catch(() => {})` on purpose, so a deploy window
    // or a dropped connection leaves the new cache without `/offline`. The
    // purge must not take the last copy on the device with it.
    const worker = evaluateWorker({
      scriptUrl: NEW,
      activeScriptUrl: NEW,
      existingCaches: { [OLD_CACHE]: [`${ORIGIN}/offline`], [NEW_CACHE]: [] },
    });
    await worker.activate();

    expect(worker.caches.urlsIn(NEW_CACHE)).toContain(`${ORIGIN}/offline`);
    expect(worker.caches.names()).not.toContain(OLD_CACHE);
  });
});

describe('sw.js — a build an open tab still runs is kept', () => {
  it('keeps the build a tab announced, for as long as that tab is open', async () => {
    // A student mid-lesson on the old build: the dialog or player it
    // lazy-loads next must still find its chunk.
    const worker = evaluateWorker({
      scriptUrl: NEW,
      activeScriptUrl: OLD,
      existingCaches: { [OLD_CACHE]: [asset('old-build')] },
      openWindows: ['tab-old'],
    });
    await worker.install();
    await worker.announce('tab-old', 'b20260901000000');
    await worker.activate();
    expect(worker.caches.names()).toContain(OLD_CACHE);

    // The tab closes; the next page that announces itself sweeps it.
    worker.windows.splice(0);
    worker.windows.push('tab-new');
    await worker.announce('tab-new', 'b20260908000000');
    expect(worker.caches.names()).not.toContain(OLD_CACHE);
  });

  it('assumes an open tab that never announced needs the build that was in charge — and only that one', async () => {
    const worker = evaluateWorker({
      scriptUrl: NEW,
      activeScriptUrl: OLD,
      existingCaches: { 'ayman-static-b20260820000000': [], [OLD_CACHE]: [asset('old-build')] },
      openWindows: ['tab-from-before-this-change'],
    });
    await worker.install();
    await worker.activate();

    expect(worker.caches.names()).toContain(OLD_CACHE);
    expect(worker.caches.names()).not.toContain('ayman-static-b20260820000000');
  });

  it('serves an old tab from its build’s cache without copying it forward', async () => {
    const worker = evaluateWorker({
      scriptUrl: NEW,
      activeScriptUrl: OLD,
      existingCaches: { [OLD_CACHE]: [asset('old-dialog')] },
      openWindows: ['tab-old'],
    });
    await worker.install();
    await worker.announce('tab-old', 'b20260901000000');
    await worker.activate();

    const response = await worker.fetchAsset(asset('old-dialog'), 'tab-old');
    expect(await response!.text()).toBe(`body of ${asset('old-dialog')}`);
    expect(worker.fetchMock).not.toHaveBeenCalled();
    expect(worker.caches.urlsIn(NEW_CACHE)).not.toContain(asset('old-dialog'));
  });
});

describe('sw.js — what the current build uses moves forward, with no second download', () => {
  it('copies the files a current page announces out of the old cache before purging it', async () => {
    // The first page after the deploy loaded while the OLD worker was in
    // charge, so an unchanged chunk it used sits in the old cache only.
    const worker = evaluateWorker({
      scriptUrl: NEW,
      activeScriptUrl: OLD,
      existingCaches: { [OLD_CACHE]: [asset('unchanged'), asset('old-only')] },
      openWindows: ['tab-new'],
    });
    await worker.install();
    await worker.activate();
    await worker.announce('tab-new', 'b20260908000000', [asset('unchanged')]);

    expect(worker.caches.urlsIn(NEW_CACHE)).toContain(asset('unchanged'));
    expect(worker.caches.urlsIn(NEW_CACHE)).not.toContain(asset('old-only'));
    expect(worker.caches.names()).not.toContain(OLD_CACHE);
  });

  it('copies forward an old-cache hit for a page that has not announced yet', async () => {
    const worker = evaluateWorker({
      scriptUrl: NEW,
      activeScriptUrl: OLD,
      existingCaches: { [OLD_CACHE]: [asset('unchanged')] },
      openWindows: ['tab-new'],
    });
    await worker.install();
    await worker.activate();

    await worker.fetchAsset(asset('unchanged'), 'tab-new');
    expect(worker.caches.urlsIn(NEW_CACHE)).toContain(asset('unchanged'));
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  it('fetches what no cache has, and files it under this build', async () => {
    const worker = evaluateWorker({ scriptUrl: NEW, activeScriptUrl: NEW, existingCaches: {} });
    await worker.fetchAsset(asset('brand-new'), 'tab-new');

    expect(worker.fetchMock).toHaveBeenCalledTimes(1);
    expect(worker.caches.urlsIn(NEW_CACHE)).toContain(asset('brand-new'));
  });
});
