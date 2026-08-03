import Link from 'next/link';
import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { RegisterForm } from '@/components/auth/register-form';
import { safeNext, withNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: copy.auth.register.title };

/** Same shell as /login — see that file for why there is no `<Card>`, and for
 * why `?next=` is read and validated here rather than in the client form. */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);

  return (
    <>
      <header className="auth-head">
        <h1 className="auth-head__title">{copy.auth.register.title}</h1>
        <p className="auth-head__sub">{copy.auth.register.subtitle}</p>
      </header>

      <RegisterForm next={next} />

      <p className="auth-switch">
        {copy.auth.switch.haveAccount}{' '}
        <Link href={withNext('/login', next)}>{copy.auth.switch.login}</Link>
      </p>
    </>
  );
}
