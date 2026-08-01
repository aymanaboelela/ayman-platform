import Link from 'next/link';
import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = { title: copy.auth.register.title };

/** Same shell as /login — see that file for why there is no `<Card>`. */
export default function RegisterPage() {
  return (
    <>
      <header className="auth-head">
        <h1 className="auth-head__title">{copy.auth.register.title}</h1>
        <p className="auth-head__sub">{copy.auth.register.subtitle}</p>
      </header>

      <RegisterForm />

      <p className="auth-switch">
        {copy.auth.switch.haveAccount} <Link href="/login">{copy.auth.switch.login}</Link>
      </p>
    </>
  );
}
