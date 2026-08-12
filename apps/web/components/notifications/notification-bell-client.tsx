'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bell } from 'lucide-react';
import { copy, formatCopy, type StudentNotification } from '@ayman/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  cn,
} from '@ayman/ui';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/(app)/notifications/actions';
import { describeNotification, formatNotificationTime } from '@/lib/notification-view';

const c = copy.notifications;

/**
 * The bell, its badge, and the panel behind it.
 *
 * Presentational: every value is a prop from `<NotificationBell>`, the Server
 * Component that read them, so this file never fetches and can be rendered in
 * a test with plain objects.
 *
 * ## Zero unread means NO badge
 *
 * Not a badge showing `0`. A permanent zero on a bell trains a student to
 * ignore the bell, which costs more than the badge ever earns.
 *
 * ## Why it is not a `<DropdownMenuItem>` list
 *
 * The rows are links AND they mutate (opening one marks it read), and Radix's
 * menu semantics would make each one a `menuitem` — announcing a list of
 * commands where the student is actually looking at a list of things that
 * happened. It is a plain list inside the panel, with real links.
 */
export function NotificationBellClient({
  unread,
  entries,
}: {
  unread: number;
  entries: StudentNotification[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function openEntry(entry: StudentNotification, href: string) {
    setOpen(false);
    // Navigate FIRST, mark read in the background. The student's intent is to
    // see the thing; making them wait on a write that only changes a badge
    // would be the wrong order, and the Server Action revalidates the layout
    // when it lands so the badge catches up on its own.
    router.push(href);
    if (!entry.readAt) {
      startTransition(() => {
        void markNotificationReadAction(entry.id);
      });
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={unread > 0 ? formatCopy(c.bellWithUnread, { n: unread }) : c.bell}
        className="relative flex size-9 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread > 0 ? (
          // `aria-hidden`: the count is already in the trigger's accessible
          // name, and announcing it twice is noise. `9+` because a
          // three-digit badge is wider than the button it sits on.
          //
          // `font-semibold`, not `font-bold`: `.mono` puts this on Plex Mono,
          // which we load at 400/500/600 only (apps/web/lib/fonts.ts), so the
          // 700 this used to ask for was never a face the browser had. The
          // class now says what was actually rendering.
          <span
            aria-hidden="true"
            className={cn(
              'mono absolute -top-0.5 -end-0.5 grid min-w-[18px] place-items-center rounded-full px-1',
              'bg-accent text-[10px] font-semibold leading-[18px] text-[#1A1206]',
            )}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-3 py-2">
          <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.panelTitle}</p>
          {unread > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  void markAllNotificationsReadAction();
                })
              }
              className="text-[length:var(--fs-text-sm)] text-accent-text transition-opacity hover:underline disabled:opacity-60"
            >
              {pending ? c.markingAll : c.markAllRead}
            </button>
          ) : null}
        </div>

        {entries.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[length:var(--fs-text-sm)] text-fg">{c.empty}</p>
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.emptyHint}</p>
          </div>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto">
            {entries.map((entry) => {
              const view = describeNotification(entry);
              return (
                <li key={entry.id} className="border-b border-line-subtle last:border-b-0">
                  <button
                    type="button"
                    onClick={() => openEntry(entry, view.href)}
                    className={cn(
                      'flex w-full items-start gap-3 px-3 py-3 text-start',
                      'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                    )}
                  >
                    {/* The unread dot. Decorative — "غير مقروء" is not
                        announced, because the panel is opened to read them
                        and every row a student has not opened carries it. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        entry.readAt ? 'bg-transparent' : 'bg-accent',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[length:var(--fs-text-sm)] text-fg">
                        {view.title}
                      </span>
                      <span className="block truncate text-[length:var(--fs-text-sm)] text-fg-muted">
                        {view.subtitle}
                      </span>
                      <span className="mono block text-[length:var(--fs-mono-label)] text-fg-faint">
                        {formatNotificationTime(entry.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-line-subtle p-2">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block rounded-sm px-2 py-1.5 text-center text-[length:var(--fs-text-sm)] text-accent-text hover:bg-surface-3"
          >
            {c.seeAll}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
