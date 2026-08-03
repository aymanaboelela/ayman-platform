import { copy } from '@ayman/contracts';
import { can, getSession } from '@/lib/session';
import { AccountMenuClient } from './account-menu-client';

/**
 * The signed-in student's account control, top of the shell.
 *
 * An async Server Component inside its own `<Suspense>`, for the reason
 * `(app)/layout.tsx` sets out at length: an `async` layout that reads
 * `headers()` blocks the ENTIRE route transition on a `/api/session`
 * round-trip, with the previous page left mounted for the duration. This
 * streams instead, so the topbar paints with its title and theme toggle and
 * the avatar appears when the session read lands.
 *
 * `getSession()` is `cache()`-wrapped, so any other consumer of the session in
 * the same render shares this one request rather than issuing a second.
 *
 * NOT a security boundary. `proxy.ts` keeps anonymous visitors out of the
 * signed-in prefixes and the API guard is the actual authorization decision;
 * `isAdmin` here only decides whether a link is drawn.
 */
export async function AccountMenu() {
  const session = await getSession();

  // Signed out mid-render: `proxy.ts` will have redirected the navigation
  // already, so this is the torn-session case rather than a real state. Render
  // nothing rather than an empty menu that opens onto no identity.
  if (!session) return null;

  return (
    <AccountMenuClient
      name={session.name}
      email={session.email}
      image={session.image}
      isAdmin={can(session, 'admin:access')}
    />
  );
}

/**
 * Holds the trigger's exact footprint while the session read is in flight, so
 * the topbar's end cluster does not shift left when the avatar lands. A plain
 * circle, not a shimmering skeleton: this resolves in a few tens of
 * milliseconds on a warm connection and an animation that brief reads as a
 * glitch.
 */
export function AccountMenuFallback() {
  return (
    <span
      aria-label={copy.nav.account}
      className="block size-8 shrink-0 rounded-full border border-line bg-surface-3"
    />
  );
}
