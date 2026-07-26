import type { ReactNode } from 'react';

/**
 * Shell for authenticated app routes (onboarding today, the student
 * dashboard/player later). Wider than `(auth)/layout.tsx`'s `max-w-md` —
 * that width is deliberately narrow for a short login/register form, but
 * onboarding's three-step form (and later, dashboard content) needs more
 * room, including for Arabic labels that run longer than their English
 * equivalents.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-2xl px-6 py-16">{children}</main>;
}
