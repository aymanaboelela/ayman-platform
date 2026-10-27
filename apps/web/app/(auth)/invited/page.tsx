import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { referralsCopy as c } from '@ayman/contracts/copy/referrals';
import { formatCopy } from '@ayman/contracts/format';
import { getSession } from '@/lib/session';
import { SwitchAccountButton } from '@/components/referrals/switch-account-button';

export const metadata: Metadata = { title: c.signedInTitle };

/**
 * Where `/r/<code>` sends a browser that already carries a session.
 *
 * It used to go to `/register` like everyone else, and `proxy.ts` bounces a
 * signed-in visitor off `/register` to the dashboard — so the owner, testing
 * a student's link in his own browser, landed on a dashboard and read it as
 * "the link opens the sharer's page". A real friend on a shared family
 * machine would hit the same wall with no clue why.
 *
 * The referral cookie is already set by the time this renders, and signing
 * out only clears the session, so «خروج وعمل حساب جديد» keeps the
 * attribution. A stale session cookie (expired, revoked) reads as no session
 * here and goes on to `/register` — the cookie check in the route is only the
 * cheap gate, this is the real one.
 */
export default async function InvitedPage() {
  const session = await getSession();
  if (!session) redirect('/register');

  return (
    <>
      <header className="auth-head">
        <h1 className="auth-head__title">{c.signedInTitle}</h1>
        <p className="auth-head__sub">{formatCopy(c.signedInBody, { name: session.name })}</p>
      </header>

      <SwitchAccountButton />

      <p className="auth-switch">
        <Link href="/dashboard">{c.signedInStay}</Link>
      </p>
    </>
  );
}
