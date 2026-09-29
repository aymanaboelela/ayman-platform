'use client';

import { useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { useChatScroll, type ChatLatest } from './use-chat-scroll';
// Both ends of a conversation mount this, so the chat's stylesheet travels
// with it — into the admin thread's route and into the widget's lazy chunk,
// and nowhere else.
import './chat.css';

const c = copy.assistant.chat;

/**
 * The scrolling half of a chat — the same object on the instructor's thread
 * and in the student's panel, so the two ends of one conversation open, follow
 * and scroll exactly alike.
 *
 * Two boxes, and the split is the mechanism rather than markup for its own
 * sake: `.chat-scroller` is `column-reverse`, which puts its scroll origin at
 * the bottom, and `.chat-stream` is its ONE child, laid out top-to-bottom as
 * normal. So the reading order, the tab order and the DOM are all ordinary,
 * and only the starting point of the scroll is reversed. See `useChatScroll`
 * for why that is the whole fix.
 */
export function ChatViewport({
  latest,
  children,
  className,
  label,
}: {
  latest: ChatLatest | null;
  children: ReactNode;
  className?: string;
  /** The region's accessible name — «المحادثة». */
  label: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { atLatest, unseen, jumpToLatest } = useChatScroll(scrollerRef, latest);

  return (
    <div className={cn('chat-viewport', className)}>
      <div
        ref={scrollerRef}
        className="chat-scroller"
        role="region"
        aria-label={label}
        // Focusable so the thread can be scrolled from the keyboard without
        // first tabbing into a message — axe's `scrollable-region-focusable`.
        tabIndex={0}
        data-chat-scroller=""
      >
        <div className="chat-stream">{children}</div>
      </div>

      {/*
        Rendered always and hidden with an attribute, so appearing is a CSS
        transition rather than a mount — a button that pops into existence
        under a thumb that is mid-scroll gets pressed by accident.
      */}
      <button
        type="button"
        onClick={jumpToLatest}
        className="chat-jump"
        data-visible={atLatest ? 'false' : 'true'}
        aria-hidden={atLatest}
        tabIndex={atLatest ? -1 : 0}
        aria-label={unseen > 0 ? formatCopy(c.jumpUnseen, { n: unseen }) : c.jumpLabel}
        title={c.jumpLabel}
      >
        <ChevronDown className="size-5" aria-hidden="true" />
        {unseen > 0 ? (
          <span className="chat-jump__badge" aria-hidden="true">
            {unseen}
          </span>
        ) : null}
      </button>
    </div>
  );
}
