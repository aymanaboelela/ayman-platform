'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import {
  MESSAGE_REACTIONS,
  type ConversationMessageEntry,
} from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui/lib/cn';
import { Pencil, SmilePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@ayman/ui/components/button';
import { Textarea } from '@ayman/ui/components/textarea';
import { MessageBody } from '@/components/assistant/message-body';
import { MessageAttachmentView } from '@/components/assistant/message-attachment';
import { ChatMeta, type ChatDelivery } from '@/components/assistant/chat-meta';
import { monogramOf } from '@/components/assistant/chat-timeline';
import { deleteMessageAction, editMessageAction, setReactionAction } from '../actions';

const c = copy.assistant.inbox;

/** How long a press has to be held before the picker opens, in ms. */
const LONG_PRESS_MS = 450;
/** A press that MOVES this far is a scroll, not a long press. */
const SLOP_PX = 10;

/**
 * One message in the instructor's thread view, with WhatsApp's long-press
 * reaction on it.
 *
 * ## Why long-press, and why it is not the only way in
 *
 * Asked for by name — «يضغط ضغطة مطوّلة على الرسالة ويعمل إيموجي شبه واتساب».
 * It is the right gesture on a phone and it is the one he already has in his
 * fingers from the app this is imitating.
 *
 * It is also invisible and impossible on a desktop with no touch screen, so it
 * is not the only affordance: a small button appears beside the bubble on
 * hover/focus, and the picker is reachable by keyboard through it. A gesture
 * nobody can discover is a feature only its author uses.
 *
 * ## The press must not fight the page
 *
 * A long press on mobile is also the browser's own text-selection and
 * context-menu gesture, so both are suppressed on the bubble — but only after
 * the timer has actually fired, so an ordinary tap or a drag-to-scroll still
 * behaves normally. A press that moves more than `SLOP_PX` is a scroll and
 * cancels the timer; that check is what stops the picker opening in someone's
 * face every time they flick through a long thread.
 *
 * ## Optimistic, because a reaction that lags is not a reaction
 *
 * The emoji appears on the bubble immediately and the server is told after. On
 * failure it goes back and nothing is said: the whole point of the gesture is
 * that it costs nothing, and an error toast about «👍» would cost more than
 * the reaction was worth. `router.refresh()` reconciles with the server.
 */
export function MessageBubble({
  conversationId,
  message,
  who,
  startsGroup = true,
  endsGroup = true,
  seen = false,
}: {
  conversationId: string;
  message: ConversationMessageEntry;
  /** The student's name — only its first letter is drawn, as their avatar. */
  who: string;
  /** First of a run of messages from one side — see `buildChatTimeline`. */
  startsGroup?: boolean;
  /** Last of a run — carries the tail and the avatar. */
  endsGroup?: boolean;
  /**
   * HIS message, and the student has had the thread open since it was written
   * (`visitorReadAt >= createdAt`). Ignored on the student's own messages.
   */
  seen?: boolean;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  /**
   * The optimistic value, or `undefined` for "show whatever the server said".
   *
   * ⚠️ NOT `useState(message.adminReaction)` synced back by an effect. That is
   * the obvious shape and it is the one `react-hooks/set-state-in-effect`
   * rejects: mirroring a prop into state means every refresh commits a render
   * and then immediately schedules another to copy the prop across. An
   * override that DEFERS to the prop needs no effect at all — it is cleared
   * once the refresh that carries the new value has landed.
   */
  const [override, setOverride] = useState<string | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const fromVisitor = message.author === 'visitor';
  const reaction = override === undefined ? message.adminReaction : override;

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function startPress(event: React.PointerEvent) {
    // Mouse RIGHT-click is the desktop equivalent and opens it immediately;
    // anything else starts the hold timer.
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    fired.current = false;
    origin.current = { x: event.clientX, y: event.clientY };
    timer.current = setTimeout(() => {
      fired.current = true;
      setPicking(true);
    }, LONG_PRESS_MS);
  }

  function movePress(event: React.PointerEvent) {
    if (!origin.current || !timer.current) return;
    const dx = Math.abs(event.clientX - origin.current.x);
    const dy = Math.abs(event.clientY - origin.current.y);
    // Scrolling, not pressing.
    if (dx > SLOP_PX || dy > SLOP_PX) endPress();
  }

  function endPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }

  function choose(emoji: string) {
    // Tapping the one already there takes it back — WhatsApp's own rule, and
    // the reason the route is a PUT that accepts `null`.
    const next = reaction === emoji ? null : emoji;
    setPicking(false);
    setOverride(next);
    void setReactionAction(conversationId, message.id, next)
      .then(() => router.refresh())
      // Either way the override steps aside and the server's value shows: on
      // success it now agrees, and on failure the bubble silently goes back to
      // the truth rather than keeping an emoji that was never saved.
      .finally(() => setOverride(undefined));
  }

  /**
   * Rewriting in place, on the bubble, rather than in a dialog.
   *
   * The message stays where it is in the transcript while it is being edited —
   * a modal would hide the two either side of it, which are usually the whole
   * reason a correction is being made.
   */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [busy, setBusy] = useState(false);

  async function saveEdit() {
    const next = draft.trim();
    if (next.length === 0 || next === message.body) {
      setEditing(false);
      setDraft(message.body);
      return;
    }
    setBusy(true);
    const result = await editMessageAction(conversationId, message.id, next);
    setBusy(false);
    if (result.ok) {
      setEditing(false);
      router.refresh();
    } else {
      toast.error(c.messageActionFailed);
    }
  }

  async function remove() {
    // A message the student may already have read is going. Asking first is the
    // same guard «اتشحن» and a ledger delete use, for the same reason.
    if (!window.confirm(c.messageDeleteConfirm)) return;
    setPicking(false);
    setBusy(true);
    const result = await deleteMessageAction(conversationId, message.id);
    setBusy(false);
    if (result.ok) router.refresh();
    else toast.error(c.messageActionFailed);
  }

  const hasText = message.body.trim().length > 0;
  const imageOnly = !hasText && message.attachment?.kind === 'image';
  const delivery: ChatDelivery = fromVisitor ? null : seen ? 'seen' : 'sent';

  return (
    <li
      className={cn(
        'chat-row group',
        fromVisitor ? 'chat-row--other' : 'chat-row--own',
        startsGroup ? 'chat-row--start' : '',
        endsGroup ? 'chat-row--end' : '',
      )}
    >
      {/*
        The student's initial, on the LAST bubble of each run of theirs —
        where Messenger and iMessage put the face, so a run reads as one person
        talking rather than as a column of anonymous boxes. The slot is there
        on every row of their side (empty above the last) so the bubbles line
        up on one edge.

        No byline over his own bubbles any more, and none over theirs. This is
        a conversation between two people with the other one's name in the
        header directly above it; a name over every bubble was the loudest
        thing on the screen and said nothing the side of the screen did not.
        The student's panel still names HIM, gated through `tenantName()` —
        see `assistant-thread.tsx`.
      */}
      {fromVisitor ? (
        <span className="chat-avatar chat-avatar--initial" aria-hidden="true">
          {endsGroup ? monogramOf(who) : null}
        </span>
      ) : null}

      <div className="chat-row__stack">
        <div className="chat-row__line">
          <div
            onPointerDown={startPress}
            onPointerMove={movePress}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onPointerLeave={endPress}
            onContextMenu={(event) => {
              // Both the desktop way in AND the suppression of the OS menu that
              // a finished long press would otherwise raise on top of the picker.
              event.preventDefault();
              setPicking(true);
            }}
            className={cn(
              'chat-bubble',
              message.attachment ? 'chat-bubble--has-attachment' : '',
              imageOnly ? 'chat-bubble--media-only' : '',
              editing ? 'chat-bubble--editing' : '',
              // Only while the timer is armed: an ordinary tap must still be able
              // to select text, which is what a reader expects of a transcript.
              fired.current ? 'select-none' : '',
            )}
          >
            {editing ? (
              <div className="chat-edit">
                <Textarea
                  value={draft}
                  rows={3}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                  className="chat-edit__field"
                />
                <div className="flex items-center gap-2">
                  <Button type="button" onClick={saveEdit} disabled={busy}>
                    {c.messageEditSave}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setDraft(message.body);
                    }}
                    className="chat-edit__cancel"
                  >
                    {c.messageEditCancel}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* The file first and the words under it — a caption, the
                    way every messenger lays a photo out. */}
                {message.attachment ? (
                  <MessageAttachmentView
                    attachment={message.attachment}
                    tone={fromVisitor ? 'other' : 'own'}
                    labels={{ imageAlt: c.attachmentImageAlt, download: c.attachmentDownload }}
                  />
                ) : null}

                {/* An empty body is legal — a reply may be only a file — and
                    then there is no text line for the time to share, so it
                    gets a line of its own (or, over a bare photo, a pill on
                    the photo). Same rule as the student's thread: only his
                    own side draws a course card, so he sees exactly what the
                    student saw. */}
                {hasText ? (
                  <div className="chat-text">
                    <MessageBody body={message.body} trusted={!fromVisitor} />
                    <ChatMeta
                      createdAt={message.createdAt}
                      edited={message.editedAt !== null}
                      delivery={delivery}
                      variant="ghost"
                    />
                  </div>
                ) : null}
                {/* Put back deliberately, once already: replacing the page's
                    inline bubbles with this component dropped the timestamps off
                    the whole admin thread, and a transcript with no times on it
                    is not a transcript. «معدّلة» sits beside the time, not
                    instead of it: the reader needs to know WHEN it was said and
                    that the words changed since. */}
                <ChatMeta
                  createdAt={message.createdAt}
                  edited={message.editedAt !== null}
                  delivery={delivery}
                  variant={hasText ? 'corner' : imageOnly ? 'overlay' : 'line'}
                />
              </>
            )}

            {reaction ? (
              // Overlapping the bottom edge, exactly where WhatsApp puts it.
              <span className="chat-reaction">{reaction}</span>
            ) : null}
          </div>

          {/*
            The discoverable way in. Hidden until hover or keyboard focus so it
            does not clutter a transcript, but always in the tab order — the
            long press is unreachable without a touch screen and unknowable
            without being told.
          */}
          <button
            type="button"
            onClick={() => setPicking((open) => !open)}
            aria-label={c.reactLabel}
            aria-expanded={picking}
            className="chat-react-trigger"
          >
            <SmilePlus className="size-4" aria-hidden="true" />
          </button>
        </div>

        {picking ? (
          <>
            {/* Catches the next press anywhere so the row closes without needing
                a listener on `document` that outlives this component. */}
            <button
              type="button"
              aria-label={c.reactClose}
              onClick={() => setPicking(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div role="group" aria-label={c.reactLabel} className="chat-picker">
              {MESSAGE_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => choose(emoji)}
                  aria-label={emoji}
                  aria-pressed={reaction === emoji}
                  className="chat-picker__emoji"
                >
                  {emoji}
                </button>
              ))}

              {/*
                «أعدل» و«أمسح» — on HIS OWN messages only, and the check is
                `fromVisitor` because a student's words are not his to rewrite.
                The API enforces the same thing in the WHERE clause; this is what
                stops the buttons being offered where they would 404.

                In the same row as the emoji rather than a second menu: the long
                press already opens this, and «شبه واتساب بالظبط» is one sheet of
                things you can do to a message, not two.
              */}
              {fromVisitor ? null : (
                <>
                  <span aria-hidden="true" className="chat-picker__rule" />
                  <button
                    type="button"
                    onClick={() => {
                      setPicking(false);
                      setDraft(message.body);
                      setEditing(true);
                    }}
                    aria-label={c.messageEdit}
                    title={c.messageEdit}
                    className="chat-picker__action"
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={busy}
                    aria-label={c.messageDelete}
                    title={c.messageDelete}
                    className="chat-picker__action chat-picker__action--danger"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}
