import { NextResponse, type NextRequest } from 'next/server';
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_DEV,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  encodeReferralCookie,
  normalizeReferralCode,
} from '@ayman/contracts/referrals';
import { getEntitlements } from '@/lib/entitlements';

const PRODUCTION = process.env.NODE_ENV === 'production';

/** Same two names as `proxy.ts`: `__Host-` needs `Secure`, which localhost lacks. */
const SESSION_COOKIE_NAMES = ['__Host-session_token', 'session_token'] as const;

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

/**
 * `/r/<code>` — «لينك الدعوة». Remembers who shared it, then sends the visitor
 * to create an account.
 *
 * ## It only sets a cookie
 *
 * No API call, no row: attribution happens when the account is CREATED
 * (`databaseHooks.user.create.after` reads this cookie off the sign-up
 * request), so a visitor who never registers leaves nothing behind. Every
 * click rewrites the cookie — the last link clicked inside the window wins.
 * The value carries the moment of the click, and the API measures the
 * admin's current window from it, so the cookie's own lifetime is only the
 * ceiling.
 *
 * ## Behind the same switch as everything else
 *
 * A stack without `referrals` answers 404 here, exactly as its API does. An
 * unknown or malformed code still lands on the sign-up page, without a
 * cookie: the visitor wanted to join, and a dead end helps nobody.
 *
 * `httpOnly`: nothing in the browser reads it. `SameSite=Lax`: it must ride
 * the top-level return from Google's sign-in, which a Strict cookie does not.
 * Relative `Location`, so the redirect never names the container's internal
 * host behind the proxy.
 *
 * ## A browser that is already signed in goes to `/invited`
 *
 * `proxy.ts` bounces a signed-in visitor off `/register` to the dashboard, so
 * opening a link in a browser that holds ANY session looked like "the link
 * opens the sharer's page". `/invited` says the link is for a new account and
 * offers to sign out first — the cookie below is set either way, so that
 * sign-up still counts. Presence of the cookie is only the cheap gate;
 * `/invited` asks the API and sends a stale one on to `/register`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  if (!(await getEntitlements()).referrals) return new Response(null, { status: 404 });

  const { code: raw } = await params;
  let code: string | null = null;
  try {
    code = normalizeReferralCode(decodeURIComponent(raw));
  } catch {
    // A malformed escape is not a code — the visitor still lands on sign-up.
  }

  const response = new NextResponse(null, {
    status: 307,
    headers: {
      location: hasSessionCookie(request) ? '/invited' : '/register',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
  if (code) {
    response.cookies.set({
      name: PRODUCTION ? REFERRAL_COOKIE : REFERRAL_COOKIE_DEV,
      value: encodeReferralCookie(code, new Date()),
      httpOnly: true,
      secure: PRODUCTION,
      sameSite: 'lax',
      path: '/',
      maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    });
  }
  return response;
}
