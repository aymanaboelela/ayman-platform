import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { getSession } from '@/lib/session';
import { UserAvatar } from '@/components/app/user-avatar';

/**
 * The end of the marketing nav — whichever of its two states applies.
 *
 * `/courses` and `/essentials` are public pages that a signed-in student
 * reaches from their own rail. Until now they always drew "تسجيل الدخول" and
 * "حساب جديد", so following a link from inside the product landed on a screen
 * asking a student who was demonstrably signed in to sign in. That is what
 * "بيودينا على صفحة تانية خالص" describes: not a wrong URL, a wrong identity.
 *
 * Both pages stay public and stay at these URLs — they are the catalogue a
 * crawler indexes, and moving them behind the shell would have thrown that
 * away to fix a header. Only the header changes.
 *
 * ## Why this is its own async Server Component
 *
 * The same rule `(app)/layout.tsx` sets out at length: an `async` layout that
 * reads `headers()` blocks the ENTIRE route transition on a `/api/session`
 * round-trip with the previous page still mounted. `<SiteNav>` is a client
 * component driving ScrollTrigger, so it cannot read the session itself
 * either. This streams inside its own `<Suspense>` and arrives as a node.
 *
 * `getSession()` is `cache()`-wrapped, so this shares one request with any
 * other consumer on the same render.
 */
export async function SiteAccountSlot() {
  const session = await getSession();

  if (!session) {
    return (
      <>
        <Link className="site-btn site-btn--outline" href="/login">
          {copy.nav.login}
        </Link>
        <Link className="site-btn site-btn--solid" href="/register">
          {copy.nav.register}
        </Link>
      </>
    );
  }

  return (
    <Link className="site-account" href="/dashboard">
      <UserAvatar name={session.name} image={session.image} size={30} />
      {/* The name is the accessible content; the label above it is a heading
          for the action, not a second copy of the identity. Hidden below the
          `sm` breakpoint, where the avatar alone carries it. */}
      <span className="site-account__text">
        <span className="site-account__label">{copy.nav.continueStudying}</span>
        <span className="site-account__name">{session.name}</span>
      </span>
    </Link>
  );
}

/**
 * Holds the slot's footprint while the session read is in flight.
 *
 * Sized to the signed-OUT pair rather than the signed-in link, because that is
 * the wider of the two and the overwhelmingly common case on these pages — a
 * crawler and a first-time visitor both land here signed out. Reserving the
 * larger box means the nav never reflows outward as the real content arrives.
 */
export function SiteAccountSlotFallback() {
  return <span className="site-account__placeholder" aria-hidden="true" />;
}
