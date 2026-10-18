import { can, getSession } from './session';

/**
 * The lock for a Server Action whose whole effect happens on THIS server.
 *
 * Almost every action in the app needs no lock of its own: it calls Nest with
 * the visitor's cookie, Nest's deny-by-default guard refuses, and the
 * `updateTag`/`revalidatePath` after it never runs. The few that only refresh
 * a cache after the BROWSER did the write (`refreshAfterRecropAction`,
 * `refreshCourseAction`, …) have no such call, and a `'use server'` export is a
 * POST endpoint anyone can reach by id — signed in or not, and with
 * `purpose: prefetch` without passing through `proxy.ts` or its flood guard.
 * Unlocked, one of them expired the branding tag that every page's shell
 * reads, as often as a script cared to ask.
 *
 * The permission is the one the matching API write requires, so whoever could
 * have made the change is exactly who may refresh after it.
 *
 * No `import 'server-only'`: `./session` imports `next/headers`, which already
 * fails the build the moment a client module reaches this file — and the
 * jsdom suites that load an action module could not resolve the marker.
 *
 * ⚠️ Never throws. These run after a write that already succeeded, and their
 * callers `await` them inside upload and polling handlers; an API that is down
 * must cost a stale screen, not an error boundary over a finished upload.
 */
export async function callerHolds(permission: string): Promise<boolean> {
  try {
    return can(await getSession(), permission);
  } catch {
    return false;
  }
}

/** Same rule for an action that is the student's own and needs no permission. */
export async function callerSignedIn(): Promise<boolean> {
  try {
    return (await getSession()) !== null;
  } catch {
    return false;
  }
}
