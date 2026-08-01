import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { can, getSession } from '@/lib/session';

/**
 * The "لوحة التحكم" shortcut in the signed-in header, for the handful of users
 * who hold `admin:access`.
 *
 * It is its own async Server Component, rendered inside a `<Suspense>` in
 * `AppHeader`, rather than a boolean prop threaded down from the layout. That
 * distinction is the whole point: an `async` layout that reads `headers()`
 * blocks the ENTIRE route transition on a `/api/session` round-trip, and with
 * no `loading.tsx` in that segment React keeps the previous page mounted for
 * the duration. The visible symptom was two pages briefly coexisting on the
 * /register → /onboarding hand-off — long enough that `getByLabel('الاسم
 * الكامل')` matched a field on each of them at once and the signup e2e flow
 * failed on a strict-mode count.
 *
 * Streaming this one link instead means the header — and the page under it —
 * paints immediately, and the link appears when the session read lands.
 *
 * `getSession()` is `cache()`-wrapped, so rendering this in both the desktop
 * bar and the mobile sheet costs one request, not two.
 *
 * NOT a security boundary. `proxy.ts` keeps anonymous visitors out of
 * `/admin`, `(admin)/layout.tsx` re-checks, and the API guard is the actual
 * authorization decision. All this decides is whether a link is drawn.
 */
export async function AdminLink({ className }: { className?: string }) {
  const session = await getSession();
  if (!can(session, 'admin:access')) return null;

  return (
    <Link
      href="/admin"
      className={
        className ??
        'hidden items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] hover:bg-surface-3 hover:text-fg sm:inline-flex'
      }
    >
      <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
      {copy.nav.adminPanel}
    </Link>
  );
}
