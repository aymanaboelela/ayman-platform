'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { AymanAvatar } from '@/components/assistant/ayman-avatar';
import { loadAssistantSummary } from '@/components/assistant/assistant-summary';
import { openAssistant } from '@/components/assistant/assistant-open';

const c = copy.dashboard.instructorMessage;

/**
 * «رسالة ليك» — an unread message from the instructor, at the top of the home
 * screen.
 *
 * ## Why the message needs a card when it is already in the widget
 *
 * Because the widget is a 56px disc pinned over the corner of the page, and a
 * student has no reason to press it. The messages «رسايل م. أيمن» sends are
 * written to be acted on the day they arrive — «ذاكرهم النهارده وهما لسه طازة
 * في دماغك» — and one that waits behind a button nobody presses is a message
 * nobody sent. The card is what makes the channel real.
 *
 * ## What it deliberately does NOT do
 *
 * It does not render the whole message and it carries no reply box. Both would
 * make this a second place to read a conversation, and the student would then
 * have two inboxes showing one thread — the exact thing `notification-view.ts`
 * refuses to build a `/conversations/:id` route for. It shows the opening lines
 * and hands off to the widget, which owns the thread and the reply.
 *
 * ## Why it disappears when there is nothing unread
 *
 * A permanent «رسالة من أيمن» panel that is always on the page is furniture,
 * and furniture is invisible within a week — at which point the one time it
 * matters, nobody sees it either. It renders only while something is waiting.
 *
 * ## Why it renders nothing at all on the server
 *
 * The unread state is per-student and changes the moment they open the thread,
 * so it cannot be part of a cached render — and the page it sits on is the one
 * whose parallel server reads already drew 429s from the throttle. It mounts
 * empty, reserves no space, and appears when the probe (shared with the
 * launcher — see `loadAssistantSummary`) comes back.
 */
export function InstructorMessageCard() {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAssistantSummary()
      .then((summary) => {
        if (cancelled) return;
        setPreview(summary.latestFromAyman);
      })
      // Silence is correct here. The card is an invitation, not information the
      // student is missing — every one of these messages is also in the bell,
      // the notifications page and the widget. An error banner on the home
      // screen because a teaser could not load would be worse than no teaser.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!preview) return null;

  return (
    <section
      className={cn(
        'mb-6 overflow-hidden rounded-[var(--r-lg)] border border-accent/35',
        'bg-[color-mix(in_oklch,var(--a-9),var(--n-2)_92%)]',
      )}
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <AymanAvatar size="md" className="mt-0.5" />

        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
            {c.eyebrow}
          </p>
          <p className="mt-0.5 text-[length:var(--fs-text-base)] font-semibold text-fg">
            {c.role}
          </p>

          {/*
            `whitespace-pre-wrap` and `line-clamp-6`, together.

            The body arrives as paragraphs with a bulleted list of topics in the
            middle; collapsed to one run of text that list becomes a wall, which
            is the difference between a message that reads as written by a
            person and one that reads as a notification. The clamp is what keeps
            a long one from taking the whole screen — the teaser is capped
            server-side too (`SUMMARY_PREVIEW_MAX`), so this is the second of
            two bounds, not the only one.
          */}
          <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-[length:var(--fs-text-sm)] leading-[1.75] text-fg">
            {preview}
          </p>

          <button
            type="button"
            // `'thread'`, not the default `'escalate'` — this button promises the
            // message, and the handoff form is a blank box asking for a question.
            onClick={() => openAssistant('thread')}
            className={cn(
              // Amber-filled, and it is allowed to be: this card takes the
              // hero slot's place at the top of the page only when there IS an
              // unread message, and it sits above the resume card rather than
              // beside it. Two amber buttons never share a viewport here
              // because the card is the first thing and is rarely present.
              'mt-3.5 inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4',
              'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
              'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
            )}
          >
            {c.open}
            {/* `ArrowLeft` — this is RTL, and "forward" points that way. */}
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
