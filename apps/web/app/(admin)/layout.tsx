import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { Toaster } from '@/components/toaster';

/**
 * `proxy.ts` (`PROTECTED_PREFIXES` includes `/admin`) is what actually keeps
 * anonymous visitors out. NestJS's deny-by-default guard + `course:*`
 * permissions is what actually keeps non-admins out even with a valid
 * session. This layout renders chrome; it is not a security boundary.
 *
 * The `sonner` <Toaster/> is mounted HERE, once, because Plan 5's quiz
 * builder and Plan 6's every-save-is-a-toast surfaces both assume exactly
 * one mount in the admin tree. Two mounts render every toast twice.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[var(--w-shell)] gap-8 px-6 py-10">
      <nav aria-label={copy.admin.nav.dashboard} className="w-48 shrink-0">
        <p className="eyebrow mb-3">{copy.admin.nav.content}</p>
        <ul className="space-y-1">
          <li>
            <Link
              href="/admin/courses"
              className="block rounded-sm px-3 py-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {copy.admin.nav.courses}
            </Link>
          </li>
          <li>
            <Link
              href="/admin/questions"
              className="block rounded-sm px-3 py-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {copy.admin.nav.questions}
            </Link>
          </li>
          <li>
            <Link
              href="/admin/appeals"
              className="block rounded-sm px-3 py-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {copy.admin.nav.appeals}
            </Link>
          </li>
        </ul>
      </nav>
      <main className="min-w-0 flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
