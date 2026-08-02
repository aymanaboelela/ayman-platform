// @vitest-environment node
//
// The default jsdom environment in `vitest.config.ts` exists for hook and
// component tests. This module is server-only and speaks in `ReadableStream`
// and `Buffer`, so it runs against Node's globals rather than jsdom's.
import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error — the handler is plain `.js` by necessity: Next imports it at
// runtime with no transform step. JSDoc carries its types; this test is the check.
import { createCacheHandler } from './redis.js';

/**
 * A fake standing in for the parts of ioredis the handler actually uses:
 * `getBuffer`, `set` with `EX`, `hgetall`, `hset`. Two handlers sharing one
 * fake are two web instances sharing one Redis — which is how the cross-instance
 * invalidation and the survives-a-restart cases below are expressed.
 */
class FakeRedis {
  strings = new Map<string, Buffer>();
  hashes = new Map<string, Record<string, string>>();
  failing = false;
  calls = { getBuffer: 0, set: 0, hgetall: 0, hset: 0 };

  private guard() {
    if (this.failing) throw new Error('ECONNREFUSED');
  }

  async getBuffer(key: string) {
    this.calls.getBuffer += 1;
    this.guard();
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: Buffer, _mode: string, _ttl: number) {
    this.calls.set += 1;
    this.guard();
    this.strings.set(key, value);
    return 'OK';
  }

  async hgetall(key: string) {
    this.calls.hgetall += 1;
    this.guard();
    return this.hashes.get(key) ?? {};
  }

  async hset(key: string, fields: Record<string, string>) {
    this.calls.hset += 1;
    this.guard();
    this.hashes.set(key, { ...(this.hashes.get(key) ?? {}), ...fields });
    return Object.keys(fields).length;
  }
}

/** The shape Next hands to `set` — a stream plus the four timing fields. */
function entry(
  body: string,
  overrides: Partial<{
    tags: string[];
    stale: number;
    timestamp: number;
    expire: number;
    revalidate: number;
  }> = {},
) {
  return Promise.resolve({
    value: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    tags: [],
    stale: 0,
    timestamp: 1_000_000,
    expire: 3600,
    revalidate: 60,
    ...overrides,
  });
}

async function read(result: { value: ReadableStream<Uint8Array> }) {
  const reader = result.value.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

let clock = 1_000_000;
let client: FakeRedis;
const now = () => clock;
const silent = () => {};

function handler(overrides: Record<string, unknown> = {}) {
  return createCacheHandler({ client, now, onError: silent, ...overrides });
}

beforeEach(() => {
  clock = 1_000_000;
  client = new FakeRedis();
});

describe('round trip', () => {
  it('returns the bytes that were written', async () => {
    const cache = handler();
    await cache.set('k', entry('hello'));

    const hit = await cache.get('k');
    expect(hit).toBeDefined();
    expect(await read(hit)).toBe('hello');
  });

  it('preserves the entry stream for Next after set drains it', async () => {
    const cache = handler();
    const pending = entry('hello');
    await cache.set('k', pending);

    // `set` tees rather than consuming: Next still holds this entry.
    expect(await read(await pending)).toBe('hello');
  });

  it('serves a repeat read from memory without touching Redis', async () => {
    const cache = handler();
    await cache.set('k', entry('hello'));
    const before = client.calls.getBuffer;

    await cache.get('k');
    expect(client.calls.getBuffer).toBe(before);
  });

  it('recovers an entry from Redis after the process memory is gone', async () => {
    await handler().set('k', entry('survives'));

    // A fresh handler over the same Redis is a restarted container.
    const restarted = handler();
    const hit = await restarted.get('k');

    expect(hit).toBeDefined();
    expect(await read(hit)).toBe('survives');
  });

  it('misses on a key that was never written', async () => {
    expect(await handler().get('absent')).toBeUndefined();
  });
});

describe('expiry', () => {
  it('serves an entry inside its revalidate window unchanged', async () => {
    const cache = handler();
    await cache.set('k', entry('fresh', { revalidate: 60, expire: 3600 }));

    clock += 30_000;
    const hit = await cache.get('k');
    expect(hit.revalidate).toBe(60);
  });

  it('serves stale-while-revalidate between revalidate and expire', async () => {
    const cache = handler();
    await cache.set('k', entry('stale-ok', { revalidate: 60, expire: 3600 }));

    clock += 120_000; // past revalidate, well inside expire

    const hit = await cache.get('k');
    // The whole point of a persistent handler: Next's in-memory default drops
    // this entry, forcing the visitor to wait on the API. This serves it and
    // signals a background refresh with a negative revalidate.
    expect(hit).toBeDefined();
    expect(await read(hit)).toBe('stale-ok');
    expect(hit.revalidate).toBe(-1);
  });

  it('refuses an entry past expire', async () => {
    const cache = handler();
    await cache.set('k', entry('gone', { revalidate: 60, expire: 3600 }));

    clock += 3_600_001;
    expect(await cache.get('k')).toBeUndefined();
  });
});

describe('tags', () => {
  it('expires entries created before the invalidation, not after', async () => {
    const cache = handler();
    await cache.set('old', entry('old', { tags: ['nav'], timestamp: clock }));

    clock += 1000;
    await cache.updateTags(['nav']);

    expect(await cache.get('old')).toBeUndefined();

    clock += 1000;
    await cache.set('new', entry('new', { tags: ['nav'], timestamp: clock }));
    expect(await cache.get('new')).toBeDefined();
  });

  it('leaves entries carrying other tags alone', async () => {
    const cache = handler();
    await cache.set('nav', entry('nav', { tags: ['nav'], timestamp: clock }));
    await cache.set('flags', entry('flags', { tags: ['flags'], timestamp: clock }));

    clock += 1000;
    await cache.updateTags(['nav']);

    expect(await cache.get('nav')).toBeUndefined();
    expect(await cache.get('flags')).toBeDefined();
  });

  it('marks an entry stale but usable when durations.expire is in the future', async () => {
    const cache = handler();
    await cache.set('k', entry('body', { tags: ['nav'], timestamp: clock }));

    clock += 1000;
    await cache.updateTags(['nav'], { expire: 300 });

    const hit = await cache.get('k');
    expect(hit).toBeDefined();
    expect(hit.revalidate).toBe(-1);

    clock += 300_001; // the future expiry has now passed
    expect(await cache.get('k')).toBeUndefined();
  });

  it('reports the latest invalidation timestamp through getExpiration', async () => {
    const cache = handler();

    expect(await cache.getExpiration(['nav'])).toBe(0);

    await cache.updateTags(['nav']);
    const first = clock;
    clock += 5000;
    await cache.updateTags(['flags']);

    expect(await cache.getExpiration(['nav'])).toBe(first);
    expect(await cache.getExpiration(['nav', 'flags'])).toBe(clock);
    expect(await cache.getExpiration(['untouched'])).toBe(0);
  });

  it('picks up an invalidation written by another instance on refreshTags', async () => {
    const one = handler();
    const two = handler();

    await two.set('k', entry('body', { tags: ['nav'], timestamp: clock }));
    expect(await two.get('k')).toBeDefined();

    clock += 1000;
    await one.updateTags(['nav']); // the admin's request lands on instance one

    // Without the refresh, instance two has no idea.
    expect(await two.get('k')).toBeDefined();

    await two.refreshTags();
    expect(await two.get('k')).toBeUndefined();
  });

  it('coalesces concurrent refreshTags into one round trip', async () => {
    const cache = handler();
    await Promise.all([cache.refreshTags(), cache.refreshTags(), cache.refreshTags()]);
    expect(client.calls.hgetall).toBe(1);
  });
});

describe('when Redis is unreachable', () => {
  it('still serves reads and writes from memory', async () => {
    const cache = handler();
    client.failing = true;

    await cache.set('k', entry('memory-only'));
    const hit = await cache.get('k');

    expect(hit).toBeDefined();
    expect(await read(hit)).toBe('memory-only');
  });

  it('still invalidates locally, so an admin reads their own write', async () => {
    const cache = handler();
    await cache.set('k', entry('body', { tags: ['nav'], timestamp: clock }));

    client.failing = true;
    clock += 1000;
    await cache.updateTags(['nav']);

    expect(await cache.get('k')).toBeUndefined();
  });

  it('does not reject from refreshTags', async () => {
    const cache = handler();
    client.failing = true;
    await expect(cache.refreshTags()).resolves.not.toThrow();
  });

  it('reports each failing operation once and then stays quiet', async () => {
    // No `onError` override here — this exercises the shipped default, whose
    // job is to report the incident without burying it under one line per
    // request for the whole outage.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cache = createCacheHandler({ client, now });

    client.failing = true;
    await cache.get('a');
    await cache.get('b');

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

/**
 * Regression cover for a bug a fake client could not have caught, and a real
 * Redis did: with `enableOfflineQueue: false`, ioredis rejects any command sent
 * before the socket is up, so the first write after a container start never
 * reached Redis.
 */
describe('connection state', () => {
  class LazyRedis extends FakeRedis {
    status = 'wait';
    connectCalls = 0;

    async connect() {
      this.connectCalls += 1;
      this.status = 'ready';
    }
  }

  it('connects once on the first operation instead of dropping it', async () => {
    const lazy = new LazyRedis();
    const cache = createCacheHandler({ client: lazy, now, onError: silent });

    await cache.set('k', entry('first write'));

    expect(lazy.connectCalls).toBe(1);
    expect(lazy.strings.has('next:cache:k')).toBe(true);
  });

  it('does not reconnect on every subsequent operation', async () => {
    const lazy = new LazyRedis();
    const cache = createCacheHandler({ client: lazy, now, onError: silent });

    await cache.set('a', entry('a'));
    await cache.set('b', entry('b'));
    await cache.refreshTags();

    expect(lazy.connectCalls).toBe(1);
  });

  it('serves from memory without blocking while the socket is down', async () => {
    const lazy = new LazyRedis();
    const cache = createCacheHandler({ client: lazy, now, onError: silent });

    await cache.set('k', entry('cached'));
    // A dropped connection: ioredis reconnects on its own, and a render must
    // never wait on that.
    lazy.status = 'reconnecting';

    const hit = await cache.get('k');
    expect(await read(hit)).toBe('cached');
    expect(lazy.connectCalls).toBe(1);
  });

  it('skips Redis entirely while reconnecting rather than erroring', async () => {
    const lazy = new LazyRedis();
    const cache = createCacheHandler({ client: lazy, now, onError: silent });
    await cache.set('k', entry('body'));

    lazy.status = 'reconnecting';
    const before = lazy.calls.getBuffer;

    // Memory cleared, Redis unavailable — a miss, not a thrown request.
    const cold = createCacheHandler({ client: lazy, now, onError: silent });
    lazy.status = 'reconnecting';
    expect(await cold.get('k')).toBeUndefined();
    expect(lazy.calls.getBuffer).toBe(before);
  });
});

describe('without a client at all', () => {
  it('works as a plain in-memory cache, which is what next build runs in', async () => {
    const cache = createCacheHandler({ client: null, now });

    await cache.set('k', entry('built'));
    const hit = await cache.get('k');

    expect(await read(hit)).toBe('built');
    await expect(cache.refreshTags()).resolves.toBeUndefined();
    await expect(cache.updateTags(['nav'])).resolves.toBeUndefined();
  });
});

describe('a set that is still in flight', () => {
  it('makes a concurrent get wait rather than report a miss', async () => {
    const cache = handler();

    let release!: (value: unknown) => void;
    const slow = new Promise((resolve) => {
      release = resolve;
    }).then(() => entry('eventual'));

    const writing = cache.set('k', slow as never);
    const reading = cache.get('k');

    release(undefined);
    await writing;

    const hit = await reading;
    expect(hit).toBeDefined();
    expect(await read(hit)).toBe('eventual');
  });
});

describe('corrupt data in Redis', () => {
  it('is a miss, not an error', async () => {
    client.strings.set('next:cache:k', Buffer.from('not a frame'));
    await expect(handler().get('k')).resolves.toBeUndefined();
  });
});
