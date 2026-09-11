import type { Metadata } from 'next';
import { NotificationFeedSchema, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { NotificationList } from '@/components/notifications/notification-list';
import { PushOptIn } from '@/components/notifications/push-opt-in';

export const metadata: Metadata = { title: copy.notifications.title };

const c = copy.notifications;

/**
 * The full notification history.
 *
 * The panel behind the bell shows the newest eight; this is where the rest
 * lives. One authenticated read on the server, then `<NotificationList>` takes
 * over for paging and marking read — the same split `<ActivityFeed>` uses, for
 * the same reason: the first page is what the page IS and belongs in the SSR'd
 * HTML, while "load more" is genuinely interactive.
 */
export default async function NotificationsPage() {
  const feed = await apiGetAuthed('/api/me/notifications', NotificationFeedSchema);

  return (
    <main className="mx-auto w-full max-w-[var(--w-prose)] px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-2 text-fg-muted">{c.subtitle}</p>
      </header>

      {/*
        Above the feed, not below it: a student who scrolls a long history and
        never reaches the bottom is exactly the student this is for. It renders
        nothing once the question has been answered either way.
      */}
      <PushOptIn />

      <NotificationList initialEntries={feed.entries} initialCursor={feed.nextCursor} />
    </main>
  );
}
