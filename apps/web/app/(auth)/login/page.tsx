import Link from 'next/link';
import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { LoginForm } from '@/components/auth/login-form';
import { safeNext, withNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: copy.auth.login.title };

/**
 * No `<Card>` any more. The form sits directly on the split screen's form
 * column: a card inside a column that is already visually distinct from the
 * panel beside it is a box drawn around a box, and its `bg-surface-2` fill was
 * also what made the old dark-gradient shell look like two unrelated screens
 * stacked on each other.
 *
 * `?next=` is read HERE, in the Server Component, and validated once by
 * `safeNext` before it reaches anything that renders or navigates. Reading it
 * in the client form via `useSearchParams()` instead would drag this route into
 * a Suspense boundary it does not otherwise need, and would leave an
 * unvalidated value one careless line away from a `router.push` — on the page a
 * visitor is most primed to trust. The sibling `loading.tsx` already provides
 * the boundary awaiting `searchParams` needs.
 */
/**
 * The provider round trip's failure codes, mapped to something a student can
 * act on.
 *
 * Better Auth appends `?error=<code>` to whatever `errorCallbackURL` the
 * sign-in request carried (`oauth2/errors.mjs:12`), and
 * `components/auth/auth-providers.tsx` now points that at this page. Before
 * it did, the fallback was `${baseURL}/error` — the library's own bare English
 * page, under `/api/auth/`, with no nav and no way back.
 *
 * `account_not_linked` is the one that actually happens on this platform, and
 * it is not an outage: Better Auth refuses to link a social login onto a local
 * account whose `emailVerified` is false, and with no email-verification flow
 * anywhere in the product that is EVERY account created with a password. So
 * the copy names the way in — use the password — rather than apologising for a
 * failure the student cannot do anything about.
 *
 * Everything else collapses to one generic line. The set of codes Better Auth
 * can emit is long, provider-specific and not stable across versions, and a
 * student has no use for the difference between `invalid_code` and
 * `unable_to_get_user_info`.
 *
 * Read as a plain string and never rendered — only ever used to CHOOSE between
 * two copy constants, so a crafted `?error=` cannot put text on the page.
 */
function socialErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return code === 'account_not_linked'
    ? copy.auth.errors.socialAccountNotLinked
    : copy.auth.errors.socialGeneric;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const socialError = socialErrorMessage(params.error);

  return (
    <>
      <header className="auth-head">
        <h1 className="auth-head__title">{copy.auth.login.title}</h1>
        <p className="auth-head__sub">{copy.auth.login.subtitle}</p>
      </header>

      {/* Only for a visitor the gate sent here — the presence of a valid `next`
          IS the signal, so no second query parameter carries a "reason" that
          this one already implies. Somebody who chose to sign in does not need
          to be told to. */}
      {next ? (
        <p className="auth-notice" role="status">
          {copy.auth.login.continueNotice}
        </p>
      ) : null}

      {/* Above the form, because the resolution for the common case IS the
          form: the student came back from Google and needs to use the email
          and password fields directly below this line. `role="alert"` so it is
          announced on arrival — the visitor has just been redirected and did
          not choose to come here. */}
      {socialError ? (
        <p
          className="auth-notice"
          role="alert"
          style={{ color: 'var(--err)', borderColor: 'var(--err)' }}
        >
          {socialError}
        </p>
      ) : null}

      <LoginForm next={next} />

      <p className="auth-switch">
        {copy.auth.switch.noAccount}{' '}
        {/* Carries `next` across, so a visitor who needs an account first is not
            the one person the whole return trip forgets about. */}
        <Link href={withNext('/register', next)}>{copy.auth.switch.createAccount}</Link>
      </p>
    </>
  );
}
