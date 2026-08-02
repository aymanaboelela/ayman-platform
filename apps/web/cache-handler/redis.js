/**
 * The `'use cache'` cache handler, backed by Redis with an in-memory tier.
 *
 * Wired in `next.config.ts` as `cacheHandlers.default`. Next loads this file at
 * runtime with `await import(fileURL)` and NO transform step — which is why it
 * is `.js` and not `.ts`. Types are documented with JSDoc and checked by the
 * companion test.
 *
 * This file knows NOTHING about the platform — no tags, no settings, no
 * catalog. It takes a key and returns bytes. The tag vocabulary lives in
 * `lib/cache-tags.ts` and nothing here duplicates it. That boundary is what
 * lets the handler be tested against a fake client without booting Next.
 *
 * ⚠️ Fail OPEN, unlike `apps/api/src/redis/redis.module.ts` which deliberately
 * fails closed. A rate limiter that cannot reach Redis has no limit and must
 * error; a cache that cannot reach Redis is merely a slower cache. If both
 * failed the same way, Redis would become a single point of failure for the
 * whole platform — the opposite of the point.
 */

import Redis from 'ioredis';

const KEY_PREFIX = 'next:cache:';
const TAGS_KEY = 'next:tags';

/** 50 MB, matching Next's own `cacheMaxMemorySize` default. */
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

/**
 * @typedef {object} CacheMeta
 * @property {string[]} tags
 * @property {number} stale     seconds — for the client, not for expiry
 * @property {number} timestamp ms since epoch, when the entry was created
 * @property {number} expire    seconds — how long the entry may still be used
 * @property {number} revalidate seconds — how long until it should be refreshed
 */

/**
 * @typedef {object} TagState
 * @property {number} [expired] ms since epoch
 * @property {number} [stale]   ms since epoch
 */

// ── framing ───────────────────────────────────────────────────────────
//
// One Redis key per entry: a 4-byte big-endian header length, the metadata as
// JSON, then the payload. One round trip to read, one to write — a metadata
// key beside a payload key would double both and could tear between them.

/**
 * @param {CacheMeta} meta
 * @param {Buffer} payload
 * @returns {Buffer}
 */
function encodeFrame(meta, payload) {
  const header = Buffer.from(JSON.stringify(meta), 'utf8');
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(header.byteLength, 0);
  return Buffer.concat([length, header, payload]);
}

/**
 * Returns null rather than throwing on a malformed frame: a corrupt or
 * truncated value is a cache miss, never an error page.
 *
 * @param {Buffer} frame
 * @returns {{meta: CacheMeta, payload: Buffer} | null}
 */
function decodeFrame(frame) {
  if (!Buffer.isBuffer(frame) || frame.byteLength < 4) return null;
  const headerLength = frame.readUInt32BE(0);
  if (frame.byteLength < 4 + headerLength) return null;
  try {
    const meta = JSON.parse(frame.subarray(4, 4 + headerLength).toString('utf8'));
    if (!meta || !Array.isArray(meta.tags)) return null;
    return { meta, payload: frame.subarray(4 + headerLength) };
  } catch {
    return null;
  }
}

/** @param {Buffer} bytes */
function streamOf(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

/**
 * Drains a stream into one Buffer. Next hands `set` an entry whose stream may
 * still be being written, so this is always awaited before storing.
 *
 * @param {ReadableStream<Uint8Array>} stream
 * @returns {Promise<Buffer>}
 */
async function drain(stream) {
  const reader = stream.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// ── memory tier ───────────────────────────────────────────────────────

/**
 * Insertion-ordered LRU bounded by total bytes. A `Map` preserves insertion
 * order, and re-inserting on read moves an entry to the end — so the first key
 * `keys()` yields is always the least recently used.
 */
class ByteBoundedCache {
  /** @param {number} maxBytes */
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    /** @type {Map<string, {meta: CacheMeta, payload: Buffer}>} */
    this.entries = new Map();
  }

  /** @param {string} key */
  get(key) {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }

  /**
   * @param {string} key
   * @param {{meta: CacheMeta, payload: Buffer}} value
   */
  set(key, value) {
    this.delete(key);
    // An entry larger than the whole budget would evict everything and then
    // still not fit — skip it rather than emptying the cache for nothing.
    if (value.payload.byteLength > this.maxBytes) return;
    this.entries.set(key, value);
    this.bytes += value.payload.byteLength;
    for (const oldest of this.entries.keys()) {
      if (this.bytes <= this.maxBytes) break;
      this.delete(oldest);
    }
  }

  /** @param {string} key */
  delete(key) {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.bytes -= existing.payload.byteLength;
    this.entries.delete(key);
  }
}

// ── tag semantics ─────────────────────────────────────────────────────
//
// Transcribed from Next's own `tags-manifest.external.js` so a custom handler
// and the default one agree on what "expired" and "stale" mean. Diverging here
// would be invisible until a page served stale content forever.

/**
 * @param {Map<string, TagState>} manifest
 * @param {string[]} tags
 * @param {number} timestamp
 * @param {number} now
 */
function areTagsExpired(manifest, tags, timestamp, now) {
  for (const tag of tags) {
    const expiredAt = manifest.get(tag)?.expired;
    if (typeof expiredAt === 'number' && expiredAt <= now && expiredAt > timestamp) {
      return true;
    }
  }
  return false;
}

/**
 * @param {Map<string, TagState>} manifest
 * @param {string[]} tags
 * @param {number} timestamp
 */
function areTagsStale(manifest, tags, timestamp) {
  for (const tag of tags) {
    const staleAt = manifest.get(tag)?.stale ?? 0;
    if (staleAt > timestamp) return true;
  }
  return false;
}

// ── the handler ───────────────────────────────────────────────────────

/**
 * @param {object} [options]
 * @param {any} [options.client]   ioredis-compatible client, or null for memory-only
 * @param {number} [options.maxBytes]
 * @param {() => number} [options.now] injected clock, for tests
 * @param {(operation: string, error: unknown) => void} [options.onError]
 */
export function createCacheHandler(options = {}) {
  const {
    client = null,
    maxBytes = DEFAULT_MAX_BYTES,
    now = () => Date.now(),
    onError = defaultOnError(),
  } = options;

  const memory = new ByteBoundedCache(maxBytes);
  /** @type {Map<string, TagState>} */
  const tagManifest = new Map();
  /** @type {Map<string, Promise<void>>} */
  const pendingSets = new Map();
  /** Coalesces concurrent `refreshTags` into one round trip. @type {Promise<void> | null} */
  let inFlightRefresh = null;

  /** Set while the one-time lazy connect is in flight. @type {Promise<void> | null} */
  let connecting = null;

  /**
   * Whether a command may be sent right now.
   *
   * `enableOfflineQueue: false` means ioredis REJECTS any command issued before
   * the socket is up — so without this, the first cache write after a container
   * start fails with "Stream isn't writeable" and that entry never reaches
   * Redis. It fails open, so nothing breaks; the entry just silently never
   * persists. A real Redis caught this; the fake client could not.
   *
   * The three states are deliberately handled differently:
   *   `ready`                  → send.
   *   `wait`                   → the lazy connect has not happened yet; do it
   *                              once and wait for it. This is the boot case.
   *   `connecting`/`reconnecting`/`end` → do NOT wait. Redis is down or
   *                              flapping, and blocking a render on it is
   *                              exactly the failure this handler exists to
   *                              avoid. Serve from memory and try again next
   *                              request; ioredis reconnects on its own.
   *
   * A client with no `status` is an injected test double — always ready.
   */
  async function canSend() {
    if (!client.status || client.status === 'ready') return true;
    if (client.status !== 'wait') return false;

    connecting ??= client.connect().catch(() => {});
    await connecting;
    connecting = null;
    return client.status === 'ready';
  }

  /**
   * Every Redis call goes through here. A cache that throws is a cache that
   * takes the site down with it.
   *
   * @template T
   * @param {string} operation
   * @param {() => Promise<T>} run
   * @returns {Promise<T | undefined>}
   */
  async function tryRedis(operation, run) {
    if (!client) return undefined;
    try {
      if (!(await canSend())) return undefined;
      return await run();
    } catch (error) {
      onError(operation, error);
      return undefined;
    }
  }

  return {
    /**
     * @param {string} cacheKey
     * @returns {Promise<any>}
     */
    async get(cacheKey) {
      // Next's contract: a `get` racing a `set` for the same key must wait for
      // the write rather than reporting a miss.
      const pending = pendingSets.get(cacheKey);
      if (pending) await pending;

      let hit = memory.get(cacheKey);

      if (!hit) {
        const frame = await tryRedis('get', () => client.getBuffer(KEY_PREFIX + cacheKey));
        if (frame) {
          const decoded = decodeFrame(frame);
          if (decoded) {
            memory.set(cacheKey, decoded);
            hit = decoded;
          }
        }
      }

      if (!hit) return undefined;

      const { meta, payload } = hit;
      const age = now() - meta.timestamp;

      // Past `expire` the entry may not be served at all, even stale.
      if (age > meta.expire * 1000) {
        memory.delete(cacheKey);
        return undefined;
      }

      if (areTagsExpired(tagManifest, meta.tags, meta.timestamp, now())) {
        memory.delete(cacheKey);
        return undefined;
      }

      /**
       * The one place this handler deliberately diverges from Next's default.
       *
       * The default handler drops an entry the moment it passes `revalidate`,
       * and says why in its own header comment: an in-memory cache is fragile,
       * so warming an entry that is about to be evicted is not worth it. That
       * reasoning does not apply to a persistent store — so between
       * `revalidate` and `expire` this serves the entry with `revalidate: -1`,
       * which tells Next to use it now and refresh in the background. The
       * visitor gets a cache hit instead of waiting on the API.
       */
      const stale = age > meta.revalidate * 1000 || areTagsStale(tagManifest, meta.tags, meta.timestamp);

      return {
        tags: meta.tags,
        stale: meta.stale,
        timestamp: meta.timestamp,
        expire: meta.expire,
        revalidate: stale ? -1 : meta.revalidate,
        value: streamOf(payload),
      };
    },

    /**
     * @param {string} cacheKey
     * @param {Promise<any>} pendingEntry
     */
    async set(cacheKey, pendingEntry) {
      let release = () => {};
      pendingSets.set(
        cacheKey,
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      try {
        const entry = await pendingEntry;

        // Tee before draining: Next holds this entry and may still read its
        // stream, and a stream can only be consumed once.
        const [forNext, forUs] = entry.value.tee();
        entry.value = forNext;
        const payload = await drain(forUs);

        /** @type {CacheMeta} */
        const meta = {
          tags: entry.tags ?? [],
          stale: entry.stale,
          timestamp: entry.timestamp,
          expire: entry.expire,
          revalidate: entry.revalidate,
        };

        memory.set(cacheKey, { meta, payload });

        // Redis expiry mirrors `expire`, the point past which `get` refuses to
        // serve the entry anyway — so a dead key and an unservable key are the
        // same thing, and Redis reclaims the memory for us.
        const ttlSeconds = Math.max(1, Math.ceil(meta.expire));
        await tryRedis('set', () =>
          client.set(KEY_PREFIX + cacheKey, encodeFrame(meta, payload), 'EX', ttlSeconds),
        );
      } catch (error) {
        // A failed write is a cache miss next time round, nothing worse.
        onError('set', error);
      } finally {
        release();
        pendingSets.delete(cacheKey);
      }
    },

    /**
     * Called before each request. Pulls invalidations written by other
     * instances into the local manifest.
     */
    async refreshTags() {
      if (!client) return;
      if (inFlightRefresh) return inFlightRefresh;

      inFlightRefresh = (async () => {
        const raw = await tryRedis('refreshTags', () => client.hgetall(TAGS_KEY));
        if (raw) {
          for (const [tag, value] of Object.entries(raw)) {
            try {
              tagManifest.set(tag, JSON.parse(value));
            } catch {
              // A single unparseable field must not lose the other tags.
            }
          }
        }
      })().finally(() => {
        inFlightRefresh = null;
      });

      return inFlightRefresh;
    },

    /**
     * @param {string[]} tags
     * @returns {Promise<number>}
     */
    async getExpiration(tags) {
      let latest = 0;
      for (const tag of tags) {
        const expired = tagManifest.get(tag)?.expired ?? 0;
        if (expired > latest) latest = expired;
      }
      return latest;
    },

    /**
     * @param {string[]} tags
     * @param {{expire?: number}} [durations]
     */
    async updateTags(tags, durations) {
      const timestamp = now();

      /** @type {Record<string, string>} */
      const writes = {};
      for (const tag of tags) {
        const existing = tagManifest.get(tag) ?? {};
        /** @type {TagState} */
        const next =
          durations && durations.expire !== undefined
            ? { ...existing, stale: timestamp, expired: timestamp + durations.expire * 1000 }
            : { ...existing, expired: timestamp };

        // Local first, and unconditionally. This is what makes an admin read
        // their own write — the same reason every server action in
        // `app/(admin)/` calls `updateTag` rather than `revalidateTag`. It must
        // hold even when Redis is unreachable.
        tagManifest.set(tag, next);
        writes[tag] = JSON.stringify(next);
      }

      if (Object.keys(writes).length === 0) return;
      await tryRedis('updateTags', () => client.hset(TAGS_KEY, writes));
    },
  };
}

/**
 * Logs the first failure of each operation and then goes quiet. An unreachable
 * Redis fails on every request; logging each one buries the incident rather
 * than reporting it.
 */
function defaultOnError() {
  const reported = new Set();
  return (operation, error) => {
    if (reported.has(operation)) return;
    reported.add(operation);
    console.warn(
      `[cache-handler] Redis ${operation} failed; serving from memory only. Further ${operation} failures are silenced.`,
      error,
    );
  };
}

/**
 * No `REDIS_URL` means memory-only, and that is a supported mode, not a
 * degraded one — it is exactly what `next build` runs in.
 *
 * `apps/web/Dockerfile` passes only `NEXT_PUBLIC_*` as build args, so
 * `REDIS_URL` is absent inside `docker build` by construction: no client is
 * constructed, and no open socket can keep the build from exiting.
 */
function createClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const client = new Redis(url, {
    // No socket until the first cache operation asks for one — see `canSend`.
    // Importing this module, or building with Redis configured but unreachable,
    // must not open a connection.
    lazyConnect: true,
    // Commands issued while the connection is down must reject immediately so
    // `tryRedis` can fall back to memory. Queuing them would stall rendering
    // for the whole outage. `canSend` is what keeps this from also rejecting
    // the legitimate first command at boot.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    // Named so `CLIENT LIST` on a shared Redis identifies this service —
    // matching `ayman-api-throttler` on the API side.
    connectionName: 'ayman-web-cache',
  });
  // Required, not optional: ioredis emits `error` on every failed reconnect,
  // and an `error` event with no listener takes down the process.
  client.on('error', () => {});
  return client;
}

/**
 * Built on first use, not at import time.
 *
 * Importing this module must not open a socket: `redis.test.ts` imports it to
 * reach `createCacheHandler`, and a developer with `REDIS_URL` exported in
 * their shell would otherwise get a live connection — and a vitest run that
 * will not exit — from a test that never asked for one.
 *
 * @type {ReturnType<typeof createCacheHandler> | null}
 */
let shared = null;

function handler() {
  shared ??= createCacheHandler({ client: createClient() });
  return shared;
}

export default {
  /** @param {string} cacheKey @param {string[]} softTags */
  get: (cacheKey, softTags) => handler().get(cacheKey, softTags),
  /** @param {string} cacheKey @param {Promise<any>} pendingEntry */
  set: (cacheKey, pendingEntry) => handler().set(cacheKey, pendingEntry),
  refreshTags: () => handler().refreshTags(),
  /** @param {string[]} tags */
  getExpiration: (tags) => handler().getExpiration(tags),
  /** @param {string[]} tags @param {{expire?: number}} [durations] */
  updateTags: (tags, durations) => handler().updateTags(tags, durations),
};
