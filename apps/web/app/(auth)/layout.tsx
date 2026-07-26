import type { ReactNode } from 'react';

/**
 * Shared shell for /login and /register. `--w-prose` (640px, packages/ui's
 * reading-width token) is too wide for a short form — a form that wide reads
 * as unfinished, not spacious. `max-w-md` (28rem/448px) is Tailwind's own
 * scale rather than a one-off arbitrary value, and is comfortably narrower
 * than prose while still fitting every field label in this flow (including
 * the Arabic ones, which run longer than their English equivalents).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      {children}
    </main>
  );
}
