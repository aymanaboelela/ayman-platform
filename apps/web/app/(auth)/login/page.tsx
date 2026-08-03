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
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);

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
