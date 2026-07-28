import type { ReactNode } from 'react';
import { PasswordRobot } from '@/components/auth/password-robot';
import './auth.css';

/**
 * Shared shell for /login and /register: a neon backdrop matching the landing,
 * a password-robot mascot that covers its eyes while you type a password, and a
 * `max-w-md` (28rem) column — narrower than `--w-prose` so a short form does not
 * read as unfinished. The form/card and the auth logic inside are untouched.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <PasswordRobot />
      {children}
    </main>
  );
}
