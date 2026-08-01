import Link from 'next/link';
import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: copy.auth.login.title };

/**
 * No `<Card>` any more. The form sits directly on the split screen's form
 * column: a card inside a column that is already visually distinct from the
 * panel beside it is a box drawn around a box, and its `bg-surface-2` fill was
 * also what made the old dark-gradient shell look like two unrelated screens
 * stacked on each other.
 */
export default function LoginPage() {
  return (
    <>
      <header className="auth-head">
        <h1 className="auth-head__title">{copy.auth.login.title}</h1>
        <p className="auth-head__sub">{copy.auth.login.subtitle}</p>
      </header>

      <LoginForm />

      <p className="auth-switch">
        {copy.auth.switch.noAccount} <Link href="/register">{copy.auth.switch.createAccount}</Link>
      </p>
    </>
  );
}
