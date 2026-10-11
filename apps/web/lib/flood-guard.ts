import { CLIENT_IP_HEADER } from './client-ip';

/**
 * A ceiling on how many pages ONE anonymous address may make this server
 * render per minute — answered before any rendering happens.
 *
 * ⚠️ Why this exists (2026-10-04). Two addresses sent ~16 requests a second to
 * one tenant's site, around the clock, for two days: 6.55M requests, 90% of
 * that site's traffic. The API's throttler did its job and answered 429 — but
 * only AFTER Next had started a full server render for each hit, and the
 * render is the expensive part. One `next-server` sat on a whole core for a
 * day, the shared VPS sat at ~43% with nobody on it, the first video encode
 * pushed it to 100%, and Hostinger capped the box to 20% — every stack on it
 * went down, not just the one being hit. Blocking the two addresses at
 * Cloudflare fixed that day; the next bot will come from a different address.
 *
 * So the guard is keyed on behaviour, not on a list:
 *
 *  - **Anonymous only.** A request carrying a session cookie is a student or
 *    an admin and is never counted — a teacher's whole class on one school
 *    connection must not be locked out by its own size. A bot that bothers to
 *    sign up is the API throttler's problem, and it is one account to ban.
 *  - **Pages, not `/api/*`.** The API has its own per-route throttler; what
 *    nothing guarded was the render. Counting the API calls a page makes
 *    would also punish an honest page for being chatty.
 *  - **Per address, from `cf-connecting-ip`.** The only address this server
 *    can trust (see `lib/client-ip.ts`). No header — local, CI — no guard.
 *
 * `LIMIT_PER_MINUTE` is generous on purpose. Egyptian mobile carriers put
 * many subscribers behind one address (CGNAT), and a WhatsApp campaign sends
 * a crowd to the landing page in the same minute. 120 anonymous page renders
 * a minute is two a second from ONE address — far above any crowd of humans
 * reading pages, and both of the 2026-10-04 addresses (six and ten a second)
 * are well over it.
 *
 * In memory, per container: each tenant runs one web container, and a guard
 * that needs Redis would fail open exactly when Redis is the thing that is
 * struggling. A restart forgets the counts, which costs one minute of a bot.
 */
export const LIMIT_PER_MINUTE = 120;

const WINDOW_MS = 60_000;

/**
 * Upper bound on remembered addresses. A crawl from a botnet rotating through
 * thousands of addresses must not turn this map into the next memory leak;
 * past the cap the window is simply started again early.
 */
const MAX_TRACKED = 50_000;

interface Window {
  startedAt: number;
  counts: Map<string, number>;
  /** Addresses already logged this window — one line per offender, not per hit. */
  logged: Set<string>;
}

export interface FloodGuard {
  /** `true` when this request should be answered 429 without rendering. */
  shouldReject(ip: string | null, anonymous: boolean, pathname: string): boolean;
}

export function createFloodGuard(
  limit: number = LIMIT_PER_MINUTE,
  now: () => number = Date.now,
  log: (message: string) => void = (message) => console.warn(message),
): FloodGuard {
  let current: Window = { startedAt: now(), counts: new Map(), logged: new Set() };

  return {
    shouldReject(ip, anonymous, pathname) {
      if (!ip || !anonymous || pathname.startsWith('/api/')) return false;

      const t = now();
      // A fixed window rather than a sliding one: one map swap a minute
      // instead of a timestamp list per address, and a bot at twice the limit
      // is refused for most of every minute either way.
      if (t - current.startedAt >= WINDOW_MS || current.counts.size >= MAX_TRACKED) {
        current = { startedAt: t, counts: new Map(), logged: new Set() };
      }

      const count = (current.counts.get(ip) ?? 0) + 1;
      current.counts.set(ip, count);
      if (count <= limit) return false;

      if (!current.logged.has(ip)) {
        current.logged.add(ip);
        log(`flood-guard: ${ip} passed ${limit} anonymous pages/min — refusing until the minute ends`);
      }
      return true;
    },
  };
}

/** The address the guard counts — Cloudflare's header, or nothing. */
export function floodGuardIp(headers: Headers): string | null {
  return headers.get(CLIENT_IP_HEADER)?.trim() || null;
}
