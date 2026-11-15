'use client';

import { useEffect, useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { StudentPresence } from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui/lib/cn';
import { subscribePresence } from '@/components/notifications/live-bus';

const c = copy.assistant.inbox;

const relative = new Intl.RelativeTimeFormat('ar-EG', { numeric: 'auto' });

/** «من ١٠ دقايق» — the coarsest unit that is still honest. */
function since(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(0, 'minute');
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86_400), 'day');
}

/**
 * The server-rendered presence, kept current by the stream's `presence`
 * frames. Starts from what the page was rendered with, so the first paint
 * already knows.
 */
function useLivePresence(userId: string, initial: StudentPresence): StudentPresence {
  const [presence, setPresence] = useState(initial);
  useEffect(
    () =>
      subscribePresence((id, online, lastSeenAt) => {
        if (id !== userId) return;
        setPresence((before) => ({ online, lastSeenAt: lastSeenAt ?? before.lastSeenAt }));
      }),
    [userId],
  );
  return presence;
}

/** A minute tick, so «من ٣ دقايق» does not sit still for an hour. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * «متصل دلوقتي» / «آخر ظهور من ١٠ دقايق» — beside the student's name on the
 * thread. Nothing at all for someone never seen: «آخر ظهور» with no time is
 * not information.
 */
export function PresenceBadge({ userId, initial }: { userId: string; initial: StudentPresence }) {
  const presence = useLivePresence(userId, initial);
  const now = useNow();
  if (!presence.online && !presence.lastSeenAt) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)]',
        presence.online
          ? 'bg-[color-mix(in_oklch,var(--ok),transparent_86%)] font-medium text-[color:var(--ok)]'
          : 'text-fg-muted',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 rounded-full', presence.online ? 'bg-[color:var(--ok)]' : 'bg-fg-faint')}
      />
      <span suppressHydrationWarning>
        {presence.online
          ? c.presenceOnline
          : formatCopy(c.presenceLastSeen, { when: since(presence.lastSeenAt!, now) })}
      </span>
    </span>
  );
}

/** The green dot on a row's avatar — online only; the list has no room for «آخر ظهور». */
export function PresenceDot({ userId, initial }: { userId: string; initial: StudentPresence }) {
  const presence = useLivePresence(userId, initial);
  if (!presence.online) return null;
  return (
    <span
      role="img"
      aria-label={c.presenceOnline}
      title={c.presenceOnline}
      className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-surface-1 bg-[color:var(--ok)]"
    />
  );
}
