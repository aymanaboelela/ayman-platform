'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { BadgeCheck, ClipboardCheck, MessagesSquare } from 'lucide-react';
import {
  NotificationFeedSchema,
  copy,
  type StudentNotification,
} from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { apiGet } from '@/lib/api';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/(app)/notifications/actions';
import { describeNotification, formatNotificationTime } from '@/lib/notification-view';

const c = copy.notifications;

function iconFor(entry: StudentNotification) {
  switch (entry.kind) {
    case 'quiz_graded':
      return ClipboardCheck;
    case 'extra_attempt_granted':
      return BadgeCheck;
    case 'conversation_reply':
      return MessagesSquare;
  }
}

/**
 * The full notification history.
 *
 * First page arrives as a prop from the server so it is in the SSR'd HTML —
 * it is what the page IS. "شوف أقدم" is cursor-driven and interactive, so it
 * lives here. Same split, and the same reasoning, as `<ActivityFeed>`.
 *
 * Rows are `<Link>`s, not buttons: this is a list of things to go and look at,
 * and a real anchor gets middle-click, open-in-new-tab and a status-bar URL
 * for free. Marking read rides along on the click rather than blocking it.
 */
export function NotificationList({
  initialEntries,
  initialCursor,
}: {
  initialEntries: StudentNotification[];
  initialCursor: string | null;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const unread = entries.filter((entry) => !entry.readAt).length;

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const next = await apiGet(
        `/api/me/notifications?cursor=${encodeURIComponent(cursor)}`,
        NotificationFeedSchema,
      );
      setEntries((current) => [...current, ...next.entries]);
      setCursor(next.nextCursor);
    } catch {
      // Keep what is already on screen. Replacing a loaded history with an
      // error because page three failed loses the two pages still readable.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function markAll() {
    // Optimistic: the rows lose their dot immediately. The action revalidates
    // the layout when it lands, which is what updates the topbar badge.
    const at = new Date().toISOString();
    setEntries((current) => current.map((entry) => (entry.readAt ? entry : { ...entry, readAt: at })));
    startTransition(() => {
      void markAllNotificationsReadAction();
    });
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
        <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
        <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.emptyHint}
        </p>
      </div>
    );
  }

  return (
    <div>
      {unread > 0 ? (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={markAll}
            className="text-[length:var(--fs-text-sm)] text-accent-text hover:underline disabled:opacity-60"
          >
            {pending ? c.markingAll : c.markAllRead}
          </button>
        </div>
      ) : null}

      <ul className="overflow-hidden rounded-lg border border-line bg-surface-2">
        {entries.map((entry) => {
          const view = describeNotification(entry);
          const Icon = iconFor(entry);
          return (
            <li key={entry.id} className="border-b border-line-subtle last:border-b-0">
              <Link
                href={view.href}
                onClick={() => {
                  if (entry.readAt) return;
                  setEntries((current) =>
                    current.map((row) =>
                      row.id === entry.id ? { ...row, readAt: new Date().toISOString() } : row,
                    ),
                  );
                  startTransition(() => {
                    void markNotificationReadAction(entry.id);
                  });
                }}
                className={cn(
                  'flex items-start gap-3 p-4',
                  'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                  !entry.readAt && 'bg-[color-mix(in_oklch,var(--a-9),var(--n-2)_95%)]',
                )}
              >
                <span
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-3 text-fg-muted"
                  aria-hidden="true"
                >
                  <Icon className="size-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[length:var(--fs-text-sm)] font-medium text-fg">
                    {view.title}
                  </span>
                  {view.detail ? (
                    <span className="block text-[length:var(--fs-text-sm)] text-fg-muted">
                      {view.detail}
                    </span>
                  ) : null}
                  <span className="block truncate text-[length:var(--fs-text-sm)] text-fg-muted">
                    {view.subtitle}
                  </span>
                </span>

                <time
                  dateTime={entry.createdAt}
                  className="mono shrink-0 text-[length:var(--fs-mono-label)] text-fg-faint"
                >
                  {formatNotificationTime(entry.createdAt)}
                </time>
              </Link>
            </li>
          );
        })}
      </ul>

      {failed ? (
        <p role="alert" className="mt-3 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {c.failed}
        </p>
      ) : null}

      {cursor ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loading}
          className={cn(
            'mt-3 inline-flex h-9 items-center rounded-sm border border-line px-4',
            'text-[length:var(--fs-text-sm)] text-fg',
            'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
            'disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          {loading ? c.loading : c.more}
        </button>
      ) : null}
    </div>
  );
}
