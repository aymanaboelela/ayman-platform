'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { ArrowLeft, Bell, BellRing, CheckCheck, Clock } from 'lucide-react';
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
import { iconFor, toneFor } from './notification-icon';
import { useLiveUnread } from './notification-stream';
import './notification-panel.css';

const c = copy.notifications;

/** How many the panel shows before «شوف الكل» takes over. */
const PANEL_SIZE = 8;

const TIME = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' });

/** Midnight of the day `ms` falls on, in the viewer's own zone. */
function dayStart(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

type Group = { label: string; entries: StudentNotification[] };

/**
 * «النهارده / امبارح / قبل كده», against the clock at the moment the rows
 * ARRIVED — `now` is captured in the load handler, never read during render,
 * so the render stays pure (see `formatNotificationTime`'s note on why a
 * clock read in render is a hydration bug here).
 */
function groupByDay(entries: StudentNotification[], now: number): Group[] {
  const today = dayStart(now);
  const yesterday = today - 24 * 60 * 60 * 1000;
  const groups: Group[] = [
    { label: c.groupToday, entries: [] },
    { label: c.groupYesterday, entries: [] },
    { label: c.groupEarlier, entries: [] },
  ];
  for (const entry of entries) {
    const at = new Date(entry.createdAt).getTime();
    groups[at >= today ? 0 : at >= yesterday ? 1 : 2]!.entries.push(entry);
  }
  return groups.filter((group) => group.entries.length > 0);
}

/** Today and yesterday say only the time — the group header already said
 *  the day. Older rows carry the date too. */
function rowTime(iso: string, now: number): string {
  const at = new Date(iso).getTime();
  const yesterday = dayStart(now) - 24 * 60 * 60 * 1000;
  return at >= yesterday ? TIME.format(at) : `${DAY.format(at)} · ${TIME.format(at)}`;
}

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
  // The clock at the moment the rows arrived — what the day groups are cut
  // against. Set beside `entries`, in the handler, so render never reads it.
  const [loadedAt, setLoadedAt] = useState(0);
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
      const feed = await loadNotificationFeed(PANEL_SIZE);
      setLoadedAt(Date.now());
      setEntries(feed.entries);
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

      <DropdownMenuContent align="end" className="np w-[min(25rem,calc(100vw-1.5rem))] p-0">
        <div className="np__head">
          <span className="np__bell" aria-hidden="true">
            {count > 0 ? <BellRing className="size-5" /> : <Bell className="size-5" />}
          </span>
          <div className="min-w-0">
            <p className="np__title">{c.panelTitle}</p>
            <span className={cn('np__pill', count === 0 && 'np__pill--quiet')}>
              {count > 0 ? formatCopy(c.panelUnread, { n: count }) : c.panelAllRead}
            </span>
          </div>
          {count > 0 ? (
            <button type="button" disabled={pending} onClick={markAll} className="np__markall">
              <CheckCheck className="size-4" aria-hidden="true" />
              {pending ? c.markingAll : c.markAllRead}
            </button>
          ) : null}
        </div>

        {entries === null && !failed ? <PanelPlaceholder /> : null}

        {entries !== null && entries.length === 0 ? (
          <div className="np__empty">
            <span className="np__empty-icon" aria-hidden="true">
              <Bell className="size-6" />
            </span>
            <p className="text-[length:var(--fs-text-base)] font-semibold text-fg">{c.empty}</p>
            <p className="max-w-[18rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.emptyHint}</p>
          </div>
        ) : null}

        {entries !== null && entries.length > 0 ? (
          <div className="np__body">
            {groupByDay(entries, loadedAt).map((group) => (
              <section key={group.label} aria-label={group.label}>
                <p className="np__group">{group.label}</p>
                <ul>
                  {group.entries.map((entry) => {
                    const view = describeNotification(entry);
                    const Icon = iconFor(entry);
                    const unread = !entry.readAt;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => openEntry(entry, view.href)}
                          data-tone={toneFor(entry)}
                          className={cn('np__row', unread && 'is-unread')}
                        >
                          <span className="np__icon" aria-hidden="true">
                            <Icon className="size-[1.15rem]" />
                          </span>
                          <span className="np__text">
                            <span className="np__rtitle">{view.title}</span>
                            <span className="np__rsub">{view.subtitle}</span>
                            <span className="np__time">
                              <Clock className="size-3" aria-hidden="true" />
                              <time dateTime={entry.createdAt}>
                                {loadedAt ? rowTime(entry.createdAt, loadedAt) : formatNotificationTime(entry.createdAt)}
                              </time>
                            </span>
                          </span>
                          {/* Decorative — the panel is opened to read them, and
                              every row not yet opened carries it. */}
                          {unread ? <span className="np__dot" aria-hidden="true" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : null}

        {failed ? (
          <p
            role="alert"
            className={cn(
              'bg-surface-1 px-4 text-center text-[length:var(--fs-text-sm)] text-[color:var(--err)]',
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

        <div className="np__foot">
          <Link href="/notifications" onClick={() => setOpen(false)} className="np__all">
            {c.seeAllLong}
            <ArrowLeft className="size-4" aria-hidden="true" />
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
      <div className="np__body" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <div key={row} className="np__row">
            <Skeleton className="size-10 shrink-0 rounded-[var(--r-md)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[length:var(--fs-text-sm)]">
                <Skeleton width="wide" className="inline-block h-[0.7em] align-middle" />
              </span>
              <span className="block text-[length:var(--fs-text-xs)]">
                <Skeleton width="full" className="inline-block h-[0.7em] align-middle" />
              </span>
              <span className="block text-[length:var(--fs-text-xs)]">
                <Skeleton className="inline-block h-[0.7em] w-16 align-middle" />
              </span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
