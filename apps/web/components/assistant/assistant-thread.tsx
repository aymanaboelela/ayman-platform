'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SendHorizontal } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import {
  ConversationThreadSchema,
  MESSAGE_MAX,
  type ConversationThread,
} from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui/lib/cn';
import { apiPost, apiPostVoid } from '@/lib/api';
import { tenantName } from '@/lib/tenant';
import { AymanAvatar } from './ayman-avatar';
import { ChatMeta } from './chat-meta';
import { buildChatTimeline } from './chat-timeline';
import { groupChatTimelineByDay } from './chat-day-groups';
import { ChatViewport } from './chat-viewport';
import { MessageBody } from './message-body';
import { MessageAttachmentView } from './message-attachment';
import { useAutoGrow } from './use-auto-grow';

const c = copy.assistant.thread;
const cc = copy.assistant.chat;

/** The composer stops growing here and scrolls — about five lines in the panel. */
const COMPOSER_MAX_PX = 144;

/**
 * The visitor's side of a conversation the instructor is answering.
 *
 * This IS a chat, so it looks like one — and since the redesign it is the SAME
 * chat the instructor sees in `/admin/inbox/[id]`, from the other door: the
 * same bubbles, day chips, runs and corner stamps (`chat.css`), the same
 * scroller that opens on the newest message (`ChatViewport`). The reader's own
 * words sit on the inline-end side in the brand colour and his on the
 * inline-start side on paper, with his face on each run — the convention of
 * every messenger a student already uses, applied from THEIR side.
 *
 * The open chat with المساعد is drawn differently (see `assistant-chat.tsx`);
 * the two halves look different because they ARE different, and a student who
 * has crossed from one to the other should be able to feel that they did.
 *
 * No polling. A reply arrives on the next page load, which is what an
 * asynchronous inbox honestly promises — a typing indicator with nobody behind
 * it would be a lie the interface tells every visitor.
 */
export function AssistantThread({
  thread,
  onUpdated,
}: {
  thread: ConversationThread;
  onUpdated: (thread: ConversationThread) => void;
}) {
  const [draft, setDraft] = useState('');
  /*
   * The message on its way, drawn at the bottom of the thread before the
   * server has it — so pressing send moves the words into the conversation at
   * once, instead of leaving them sitting in the box behind a disabled button.
   * Cleared in the same batch as `onUpdated`, so the placeholder and the real
   * bubble never both show, and never neither.
   */
  const [pending, setPending] = useState<{ body: string; at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(field, draft, COMPOSER_MAX_PX);

  /*
   * Landing on the newest message is `ChatViewport`'s job now, and it is done
   * in CSS rather than here. This used to be `scrollIntoView({ block:
   * 'nearest' })` on a marker after the last bubble, run once per message
   * count — which scrolled BEFORE a photo in the thread had decoded, so the
   * photo then grew the list under it and the newest message ended up below
   * the fold again.
   */

  /*
   * Being on screen IS having read it.
   *
   * Marking read here rather than in the launcher's click handler covers all
   * three ways this view is reached — opening the panel, following a reply
   * notification's `?assistant=1`, and sending a follow-up — instead of the
   * one the button knows about. State is only ever set from inside the async
   * callback, never synchronously in the effect body, which is the pattern
   * `submit-dialog.tsx` documents and `react-hooks/set-state-in-effect`
   * requires.
   */
  useEffect(() => {
    if (thread.unreadForVisitor === 0) return;
    let cancelled = false;
    void apiPostVoid(`/api/assistant/conversations/${thread.id}/read`)
      .then(() => {
        if (cancelled) return;
        onUpdated({ ...thread, unreadForVisitor: 0 });
      })
      // Nothing to tell the student here: they are reading the message. The
      // dot clears on the next page load instead.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [thread, onUpdated]);

  const isClosed = thread.status === 'closed';

  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending || draft.trim().length === 0) return;
    const body = draft;
    setPending({ body, at: new Date().toISOString() });
    setDraft('');
    setError(null);

    try {
      const updated = await apiPost(
        `/api/assistant/conversations/${thread.id}/messages`,
        ConversationThreadSchema,
        { message: body },
      );
      onUpdated(updated);
    } catch {
      // The words go back where they were typed: a failed send that also
      // lost them would be worse than the failure.
      setDraft(body);
      setError(copy.assistant.escalate.failed);
    } finally {
      setPending(null);
    }
  }

  const timeline = buildChatTimeline(thread.messages, {
    labels: { today: cc.today, yesterday: cc.yesterday },
  });
  const last = thread.messages.at(-1);
  const latest = pending
    ? { key: `pending:${pending.at}`, at: pending.at, fromSelf: true }
    : last
      ? { key: last.id, at: last.createdAt, fromSelf: last.author === 'visitor' }
      : null;

  return (
    <section className="chat chat--panel">
      {/*
        Who is on the other end — the face and the name, once, above the
        conversation, the way a messenger heads a chat. Both halves are gated:
        `AymanAvatar` falls back to a monogram of the stack's own name, and
        `tenantName()` hands his stack «مهندس أيمن» verbatim and anybody
        else's `TENANT_DISPLAY_NAME`. `aymanRole` names no one.
      */}
      <div className="chat-peer">
        <AymanAvatar size="md" />
        <span className="min-w-0">
          <span className="chat-peer__name">{tenantName(c.ayman)}</span>
          <span className="chat-peer__role">{c.aymanRole}</span>
        </span>
      </div>

      <ChatViewport latest={latest} label={cc.regionLabel}>
        {groupChatTimelineByDay(timeline).map((day) => (
          <ol key={`day:${day.key}`} className="chat-list chat-list--day">
            <li className="chat-day">
              <span>{day.label}</span>
            </li>
            {day.entries.map((entry) => {
              const { message, startsGroup, endsGroup } = entry;
              const fromVisitor = message.author === 'visitor';
              const hasText = message.body.trim().length > 0;
              const imageOnly = !hasText && message.attachment?.kind === 'image';
              return (
                <li
                  key={message.id}
                  className={cn(
                    'chat-row',
                    // The READER's words are their own side: `own` here is the
                    // student, where on the admin screen it is him.
                    fromVisitor ? 'chat-row--own' : 'chat-row--other',
                    startsGroup ? 'chat-row--start' : '',
                    endsGroup ? 'chat-row--end' : '',
                  )}
                >
                  {/*
                    His FACE beside the last bubble of each of his runs, and
                    nothing beside the student's own. «رسايل م. أيمن» opens threads
                    he did not personally type, and the photograph is what stops
                    those reading as system notices wearing his name — see
                    `AymanAvatar`. The slot is kept on every row of his side so
                    the run lines up on one edge.
                  */}
                  {fromVisitor ? null : (
                    <span className="chat-avatar">{endsGroup ? <AymanAvatar size="sm" /> : null}</span>
                  )}
                  <div className="chat-row__stack">
                    {/*
                      His name once per run, over the first bubble. `c.ayman` is
                      «مهندس أيمن», and it is the BYLINE — the line that claims who
                      wrote the words underneath it. Ungated, a second
                      instructor's student opens her thread, reads a reply she
                      typed herself, and is told by name that a man she has never
                      heard of sent it. `tenantName()` returns «مهندس أيمن»
                      unchanged on his stack and `TENANT_DISPLAY_NAME` anywhere
                      else; the honorific does not survive the swap on purpose —
                      we do not know another instructor's title.

                      Nothing over the student's own bubbles: «إنت» was a word
                      that grows a ي in the feminine, and the side of the screen
                      already says whose they are.
                    */}
                    {!fromVisitor && startsGroup ? (
                      <span className="chat-byline">{tenantName(c.ayman)}</span>
                    ) : null}
                    <div className="chat-row__line">
                      <div
                        className={cn(
                          'chat-bubble',
                          message.attachment ? 'chat-bubble--has-attachment' : '',
                          imageOnly ? 'chat-bubble--media-only' : '',
                        )}
                      >
                        {message.attachment ? (
                          <MessageAttachmentView
                            attachment={message.attachment}
                            tone={fromVisitor ? 'own' : 'other'}
                            labels={{
                              imageAlt: c.attachmentImageAlt,
                              download: c.attachmentDownload,
                            }}
                          />
                        ) : null}

                        {/*
                          TEXT NODES and `<a>` elements — never markup. There is
                          no HTML sink anywhere on this path, and that absence,
                          not a sanitiser, is the control; `MessageBody` splits
                          the string on a URL pattern and builds React elements.

                          `trusted` only for a message his side wrote — it is
                          what lets «الكورس بتاعك» draw as a card. A visitor's own
                          pasted link never gets one; see `MessageBody`.

                          An empty body is legal — a message may be only a file —
                          and then the time gets a line of its own (or a pill on
                          the photo) instead of the corner of a text line.
                        */}
                        {hasText ? (
                          <div className="chat-text">
                            <MessageBody body={message.body} trusted={!fromVisitor} />
                            <ChatMeta
                              createdAt={message.createdAt}
                              edited={message.editedAt !== null}
                              variant="ghost"
                            />
                          </div>
                        ) : null}
                        <ChatMeta
                          createdAt={message.createdAt}
                          edited={message.editedAt !== null}
                          variant={hasText ? 'corner' : imageOnly ? 'overlay' : 'line'}
                        />

                        {/*
                          «ردّ بإيموجي» — READ ONLY on this side. The student sees
                          what the instructor put on their message and cannot set
                          one: he was the one who asked for the gesture, and a
                          picker here would be a feature nobody requested on the
                          surface where it is hardest to get right.
                        */}
                        {message.adminReaction ? (
                          <span className="chat-reaction">{message.adminReaction}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ))}

        {pending ? (
          <ol className="chat-list" aria-live="polite">
            <li className="chat-row chat-row--own chat-row--start chat-row--end chat-row--pending">
              <div className="chat-row__stack">
                <div className="chat-row__line">
                  <div className="chat-bubble">
                    <div className="chat-text">
                      <MessageBody body={pending.body} />
                      <ChatMeta createdAt={pending.at} delivery="sending" variant="ghost" />
                    </div>
                    <ChatMeta createdAt={pending.at} delivery="sending" variant="corner" />
                  </div>
                </div>
              </div>
            </li>
          </ol>
        ) : null}
      </ChatViewport>

      {isClosed ? (
        <p className="chat-closed chat-closed--center">{c.closed}</p>
      ) : (
        <form
          // `method="post"` — see `auth/login-form.tsx`. Without it a press
          // before hydration puts the message in the URL.
          method="post"
          onSubmit={send}
          className="chat-composer"
        >
          <div className="chat-composer__inner">
            {error ? (
              <p role="alert" className="mb-2 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
                {error}
              </p>
            ) : null}
            <div className="chat-composer__row">
              <div className="chat-composer__field">
                <textarea
                  ref={field}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={c.replyPlaceholder}
                  rows={1}
                  maxLength={MESSAGE_MAX}
                  aria-label={c.replyPlaceholder}
                  className="chat-composer__input"
                />
              </div>
              <button
                type="submit"
                disabled={pending !== null || draft.trim().length === 0}
                aria-label={c.send}
                title={c.send}
                className="chat-send"
              >
                <SendHorizontal className="chat-send__icon size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
