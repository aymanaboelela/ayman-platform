import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who did it, from where. Deliberately *ambient* rather than threaded through
 * every service signature.
 *
 * The alternative — an extra `context` parameter on every mutating method —
 * was rejected: it touches nine controllers and eight services to carry data
 * none of them use, and the one call site that forgets to pass it produces an
 * audit row with a null actor that looks exactly like a legitimate
 * system-initiated write. An `AsyncLocalStorage` store populated once, by a
 * global interceptor, cannot be forgotten per-call-site.
 *
 * Outside a request (a cron sweep, a seed script, a unit test) the store is
 * empty and every field reads as null — which is the honest answer.
 */
export interface AuditActor {
  actorUserId: string | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  requestId: string | null;
}

export const EMPTY_ACTOR: AuditActor = {
  actorUserId: null,
  actorIp: null,
  actorUserAgent: null,
  requestId: null,
};

const storage = new AsyncLocalStorage<AuditActor>();

/** Runs `fn` with `actor` visible to every `currentActor()` call beneath it. */
export function runWithActor<T>(actor: AuditActor, fn: () => T): T {
  return storage.run(actor, fn);
}

/** The ambient actor, or all-nulls outside a request. Never throws. */
export function currentActor(): AuditActor {
  return storage.getStore() ?? EMPTY_ACTOR;
}
