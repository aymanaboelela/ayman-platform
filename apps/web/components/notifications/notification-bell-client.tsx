'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Bell } from 'lucide-react';
import type { StudentNotification } from '@ayman/contracts/notifications';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@ayman/ui/components/dropdown-menu';
import { Skeleton } from '@ayman/ui/components/skeleton';
import { cn } from '@ayman/ui/lib/cn';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/(app)/notifications/actions';
import { describeNotification, formatNotificationTime } from '@/lib/notification-view';
import { useLiveUnread } from './notification-stream';

const c = copy.notifications;

/** How many the panel shows before «شوف الكل» takes over. */
const PANEL_SIZE = 8;

/**
 * The bell, its badge, and the panel behind it.
 *
 * The badge is a prop — `<NotificationBell>` reads the unread count on the
 * server so the number is in the first paint, before any JavaScript and
 * without a tap. The panel's ROWS are not: they are fetched here, on open,
 * for the reason that component's comment sets out (they were being rendered
 * and serialised on every signed-in page for a dropdown Radix had not
 * mounted).
 *
 * ## The rows are re-read on every open, not cached after the first
 *
 * A notification list is a claim about what has happened since the student
 * last looked, and the panel is opened precisely when they suspect that has
 * changed — a copy fetched three navigations ago is the one answer it must
 * not give. So each open starts a read. What is already on screen STAYS on
 * screen while that read is in flight, so only the very first open of a
 * session shows the placeholder; every later one repaints in place with no
 * gap and no jump. The cost is one request per deliberate tap, against the
 * one request per page load this replaced.
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
export function NotificationBellClient({ unread }: { unread: number }) {
  const router = useRouter();
  /*
    The live number wins once there IS one.

    `unread` is the server-rendered count, correct at first paint and stale the
    moment anything happens. The stream reports an absolute count with every
    event, so `?? unread` is the whole reconciliation: before the first frame
    the server's number stands, and after it the badge is live without a poll.
  */
  const live = useLiveUnread();
  const count = live ?? unread;
  const [open, setOpen] = useState(false);
  // `null` is "never loaded", which is the only state that earns the
  // placeholder. An empty array is a real answer — the student has no
  // notifications — and gets the designed empty panel instead.
  const [entries, setEntries] = useState<StudentNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  // A ref, not state: this guards against a second read being started by a
  // fast close-then-open while the first is still in flight, and it must be
  // true for the rest of THIS tick, which a re-render would be too late for.
  const loading = useRef(false);
  const [pending, startTransition] = useTransition();

  async function loadEntries() {
    if (loading.current) return;
    loading.current = true;
    setFailed(false);
    try {
      // The fetch AND its Zod schema live in `./notification-feed` and are
      // pulled in here rather than imported at the top, so the bell — which is
      // in the topbar of every signed-in route — costs a bell and not Zod's
      // 62 KB. See that file. A chunk that fails to arrive lands in the same
      // `catch` as a request that fails, and means the same thing on screen.
      const { loadNotificationFeed } = await import('./notification-feed');
      setEntries((await loadNotificationFeed(PANEL_SIZE)).entries);
    } catch {
      // Keep whatever is already on screen, exactly as `<NotificationList>`
      // does when page three fails: replacing readable rows with an error
      // because the refresh failed loses more than it explains.
      setFailed(true);
    } finally {
      loading.current = false;
    }
  }

  function openEntry(entry: StudentNotification, href: string) {
    setOpen(false);
    // Navigate FIRST, mark read in the background. The student's intent is to
    // see the thing; making them wait on a write that only changes a badge
    // would be the wrong order, and the Server Action revalidates the layout
    // when it lands so the badge catches up on its own.
    router.push(href);
    if (!entry.readAt) {
      // Drop the dot on our own copy too. `refresh()` re-renders the server
      // tree, which now carries the count and nothing else — the rows live
      // here, so nothing else would correct them, and the student would see
      // this row still marked unread if they re-opened the panel before the
      // next read landed.
      const at = new Date().toISOString();
      setEntries((current) =>
        current?.map((row) => (row.id === entry.id ? { ...row, readAt: at } : row)) ?? null,
      );
      startTransition(() => {
        void markNotificationReadAction(entry.id);
      });
    }
  }

  function markAll() {
    // Optimistic, for the same reason and with the same caveat as `openEntry`
    // above: the badge is the server's to clear, the dots are ours.
    const at = new Date().toISOString();
    setEntries((current) =>
      current?.map((entry) => (entry.readAt ? entry : { ...entry, readAt: at })) ?? null,
    );
    startTransition(() => {
      void markAllNotificationsReadAction();
    });
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadEntries();
      }}
    >
      <DropdownMenuTrigger
        aria-label={count > 0 ? formatCopy(c.bellWithUnread, { n: count }) : c.bell}
        className="relative flex size-9 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg"
      >
        <Bell className="size-4" aria-hidden="true" />
        {count > 0 ? (
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
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-3 py-2">
          <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.panelTitle}</p>
          {count > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={markAll}
              className={cn(
                // The text is the whole control — there is no box to enlarge,
                // so the hit area is just its line box: about 24px, and the
                // smallest target in the student area. `min-h-11` (44px)
                // grows the box around the same glyphs at the same size and
                // weight. The header grows with it on phones, which is the
                // price of the target and cheaper than a tap that lands
                // between «الإشعارات» and this and does nothing. Released
                // above `md`, where a pointer does not need the slack.
                'inline-flex items-center min-h-11 md:min-h-0',
                'text-[length:var(--fs-text-sm)] text-accent-text transition-opacity hover:underline disabled:opacity-60',
              )}
            >
              {pending ? c.markingAll : c.markAllRead}
            </button>
          ) : null}
        </div>

        {entries === null && !failed ? <PanelPlaceholder /> : null}

        {entries !== null && entries.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[length:var(--fs-text-sm)] text-fg">{c.empty}</p>
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.emptyHint}</p>
          </div>
        ) : null}

        {entries !== null && entries.length > 0 ? (
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
        ) : null}

        {failed ? (
          <p
            role="alert"
            className={cn(
              'px-4 text-center text-[length:var(--fs-text-sm)] text-[color:var(--err)]',
              // Nothing above it when the very first read is the one that
              // failed, so it carries the panel body's own padding; when it
              // sits under rows we already have, a rule separates it from
              // them rather than letting it read as one more notification.
              entries === null ? 'py-8' : 'border-t border-line-subtle py-3',
            )}
          >
            {c.failed}
          </p>
        ) : null}

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

/**
 * What the panel shows on the one open per session that has nothing cached
 * behind it.
 *
 * ## Why the bars are `inline-block`
 *
 * Each one sits inside a span carrying the SAME classes as the line it stands
 * in for, and an inline-level child leaves that span's height to the
 * line-height strut. The app's line-height is unitless, so the strut resolves
 * against each span's own font-size — repeat the font-size class and the
 * placeholder line measures exactly what the real line will, with no pixel
 * value here to fall out of step when the type scale moves. A block-level bar
 * would instead have collapsed each line to the bar's own height, and the
 * rows would have grown under the cursor as they filled in. `0.7em` keeps the
 * bar comfortably inside that strut, so it never sets the height itself.
 *
 * ## Three rows, not eight
 *
 * Eight is the panel's ceiling, not its typical content. Standing eight rows
 * up and then collapsing to the two a real student has is a bigger movement
 * than growing into them from three, and three is already enough to say "a
 * list is coming" rather than "something went wrong".
 *
 * The shimmer is deliberate here where `<NotificationBellFallback>` refuses
 * it: that one covers a server render measured in tens of milliseconds, this
 * one covers a browser round-trip to the API, which is long enough that a
 * motionless grey block reads as a broken panel.
 */
function PanelPlaceholder() {
  return (
    <>
      {/* The bars carry no meaning to read out. This does — and a student on
          a screen reader who opens the panel mid-flight lands on a panel that
          says what it is doing instead of one that appears to be empty. */}
      <p role="status" className="sr-only">
        {c.loading}
      </p>
      <ul aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <li key={row} className="border-b border-line-subtle last:border-b-0">
            <div className="flex w-full items-start gap-3 px-3 py-3">
              {/* Holds the unread dot's column so the bars start where the
                  text will, not 20px further in. */}
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-transparent" />
              <span className="min-w-0 flex-1">
                <span className="block text-[length:var(--fs-text-sm)]">
                  <Skeleton width="wide" className="inline-block h-[0.7em] align-middle" />
                </span>
                <span className="block text-[length:var(--fs-text-sm)]">
                  <Skeleton width="full" className="inline-block h-[0.7em] align-middle" />
                </span>
                <span className="mono block text-[length:var(--fs-mono-label)]">
                  <Skeleton className="inline-block h-[0.7em] w-16 align-middle" />
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
