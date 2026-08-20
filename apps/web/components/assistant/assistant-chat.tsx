'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { m } from 'motion/react';
import { CornerDownLeft, RotateCcw, Send, Square, UserRound } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { ASK_QUESTION_MAX } from '@ayman/contracts/assistant/ask';
import { cn } from '@ayman/ui/lib/cn';
import * as motionPresets from '@ayman/ui/motion';
import { AssistantRobot } from './assistant-robot';
import { useAssistantAsk, type ChatMessage } from './use-assistant-ask';

const c = copy.assistant.ai;

/**
 * «اسأل أي حاجة» — the half of المساعد you can type into.
 *
 * ## Why this is a chat and the guide is not
 *
 * `assistant-guide.tsx` argues at length that a decision tree should be drawn
 * as a ROUTE and not as alternating bubbles, and that argument is still right
 * for the tree. This is the other thing: a real exchange, in the student's own
 * words, where what was said two turns ago changes what «وده بكام؟» means. That
 * IS a conversation, so it is drawn as one — the same bubble geometry
 * `assistant-thread.tsx` uses for أيمن, deliberately, so a student who crosses
 * from المساعد to a person does not have to learn a second screen.
 *
 * ## What is different from أيمن's thread, on purpose
 *
 * His replies are solid amber; these are a wash. He is the reason this product
 * exists and his words should not look like a machine's — so the machine's do
 * not look like his. The disclaimer under the composer says the same thing in
 * words, once, quietly.
 *
 * ## Presentational except for one hook
 *
 * Everything on screen comes from `useAssistantAsk`. This file owns the draft
 * and the scroll and nothing else, so the network half is testable without a
 * DOM and this half renders in a test with plain objects.
 */
export function AssistantChat({
  onEscalate,
}: {
  /** Hands the question to the real inbox, pre-filled. */
  onEscalate: (question: string) => void;
}) {
  const { messages, busy, waiting, ask, stop, reset } = useAssistantAsk();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /*
   * Follow the answer down as it is written.
   *
   * Keyed on the total length of the transcript rather than on the message
   * COUNT: an answer streaming into a bubble grows the scroller without adding
   * a message, and a chat that only scrolls when a bubble appears leaves the
   * reader staring at the top of a paragraph that is filling in below them.
   *
   * `block: 'nearest'` keeps this inside the panel's own scroller — the same
   * reason `assistant-thread.tsx` uses it — instead of dragging the page
   * behind the panel.
   */
  const written = messages.reduce((total, message) => total + message.text.length, 0);
  useEffect(() => {
    // Nothing to follow yet. Without this the empty state scrolls itself to
    // the bottom on mount and the reader opens the panel onto the disclaimer,
    // with the robot and the first two openers already above the fold.
    if (messages.length === 0) return;
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [written, messages.length]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const question = draft.trim();
    if (!question) return;
    setDraft('');
    ask(question);
  }

  /*
   * Enter sends, Shift+Enter is a newline — the convention every messaging app
   * a student already uses shares. The form's own submit still works for
   * anyone on a keyboard that has no Enter behaviour to override, and the send
   * button is a real `type="submit"`, so nothing here is the only way in.
   */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submit(event);
  }

  function askStarter(question: string) {
    setDraft('');
    ask(question);
    inputRef.current?.focus();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-[13rem] flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <Welcome onPick={askStarter} />
        ) : (
          <ol className="flex flex-col gap-3.5">
            {messages.map((message) => (
              <Bubble
                key={message.id}
                message={message}
                streaming={busy && message.id === messages.at(-1)?.id}
                onEscalate={onEscalate}
                lastAsked={lastQuestion(messages, message.id)}
              />
            ))}
          </ol>
        )}

        {/* The one moment «بيفكّر…» is honest: the request is open and not one
            character has come back. It disappears on the first token rather
            than sitting above a paragraph that is already being read. */}
        {waiting ? (
          <p
            role="status"
            className="mt-3 flex items-center gap-2 px-1 text-[length:var(--fs-text-xs)] text-fg-muted"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-accent/15">
              <AssistantRobot style={{ ['--robot-size' as string]: '1rem' }} />
            </span>
            <span className="ask-dots flex items-center gap-1" aria-hidden="true">
              <span className="size-1.5 rounded-full bg-fg-faint" />
              <span className="size-1.5 rounded-full bg-fg-faint" />
              <span className="size-1.5 rounded-full bg-fg-faint" />
            </span>
            {c.thinking}
          </p>
        ) : null}

        <div ref={endRef} />
      </div>

      <form method="post" onSubmit={submit} className="border-t border-line-subtle p-3">
        {/* Only once there is something to clear. An affordance for undoing
            nothing is clutter — the same rule the launcher's «رجوع المساعد
            مكانه» follows. */}
        {messages.length > 0 ? (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                reset();
                setDraft('');
              }}
              className="flex items-center gap-1 text-[length:var(--fs-text-xs)] text-fg-muted transition-colors duration-[160ms] ease-out hover:text-fg"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              {c.clear}
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={c.placeholder}
            aria-label={c.placeholder}
            rows={1}
            maxLength={ASK_QUESTION_MAX}
            className={cn(
              'max-h-24 min-h-[2.75rem] flex-1 resize-none rounded-xl px-3 py-2.5',
              'border border-line-subtle bg-surface-1 text-[length:var(--fs-text-sm)] leading-[1.6]',
              'text-fg placeholder:text-fg-faint',
              'transition-colors duration-[160ms] ease-out focus:border-accent/50 focus:outline-none',
            )}
          />

          {/*
            One control, two jobs, and never both at once — a send button that
            stayed live beside a running answer invites a second question the
            server would refuse anyway (one open request per client, and a
            four-second throttle behind that).
          */}
          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label={c.stop}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-subtle bg-surface-2 text-fg-muted transition-colors duration-[160ms] ease-out hover:text-fg"
            >
              <Square className="size-3.5 fill-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              aria-label={c.send}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-[#1A1206] transition-opacity duration-[160ms] ease-out hover:bg-accent-hover disabled:opacity-40"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

      </form>
    </div>
  );
}

/** The question this answer is an answer TO — what gets handed to أيمن. */
function lastQuestion(messages: readonly ChatMessage[], id: number): string {
  const index = messages.findIndex((message) => message.id === id);
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (message && message.role === 'user') return message.text;
  }
  return '';
}

/**
 * The empty state — a face, a sentence, and four things worth pressing.
 *
 * A blinking cursor in an empty box is the worst first screen a chat can have:
 * it asks the reader to invent the product's scope out of nothing. The four
 * openers are the scope, stated as examples — two about the platform, one
 * about the exams, one about the SUBJECT, because "you can ask me about
 * programming too" is the half nobody guesses.
 */
function Welcome({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <span className="robot-host grid size-16 place-items-center rounded-2xl bg-accent/12">
        <AssistantRobot style={{ ['--robot-size' as string]: '2.5rem' }} />
      </span>
      <p className="max-w-[16rem] text-[length:var(--fs-text-sm)] leading-[1.7] text-fg-muted">
        {c.lead}
      </p>
      <ul className="flex w-full flex-col gap-1.5">
        {c.starters.map((starter, index) => (
          <m.li
            key={starter}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: Math.min(index, 4) * 0.04,
              duration: motionPresets.SECONDS.popover,
              ease: motionPresets.EASE_OUT,
            }}
          >
            <button
              type="button"
              onClick={() => onPick(starter)}
              className={cn(
                'group flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start',
                'border-line-subtle bg-surface-1 text-[length:var(--fs-text-sm)] text-fg',
                'transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:bg-surface-2',
              )}
            >
              <span className="flex-1">{starter}</span>
              <CornerDownLeft
                aria-hidden="true"
                className="size-3.5 shrink-0 text-fg-faint transition-colors duration-[160ms] ease-out group-hover:text-accent-text"
              />
            </button>
          </m.li>
        ))}
      </ul>
      {/*
        The framing sentence, on the ONE screen that has room for it and at the
        one moment it is useful: before anybody has typed. Repeated under every
        message it would be furniture nobody reads; here it is the answer to
        "what am I even talking to", asked and answered before the first
        question.
      */}
      <p className="max-w-[18rem] text-[length:var(--fs-text-xs)] leading-[1.7] text-fg-faint">
        {c.disclaimer}
      </p>
    </div>
  );
}

/** One turn. */
function Bubble({
  message,
  streaming,
  lastAsked,
  onEscalate,
}: {
  message: ChatMessage;
  streaming: boolean;
  lastAsked: string;
  onEscalate: (question: string) => void;
}) {
  const fromStudent = message.role === 'user';

  return (
    <li className={cn('flex flex-col gap-1', fromStudent ? 'items-start' : 'items-end')}>
      <span className="flex items-center gap-1.5 px-1 text-[length:var(--fs-text-xs)] text-fg-faint">
        {fromStudent ? (
          <UserRound className="size-3.5" aria-hidden="true" />
        ) : (
          <span className="grid size-5 place-items-center rounded-md bg-accent/15">
            <AssistantRobot style={{ ['--robot-size' as string]: '0.875rem' }} />
          </span>
        )}
        {fromStudent ? c.you : c.bot}
      </span>

      {/* An empty assistant bubble is a real state — the request is open and
          the first token has not landed. The «بيفكّر…» line below the list is
          what speaks for it, so nothing is drawn here at all rather than an
          empty box with a border. */}
      {message.text ? (
        <div
          className={cn(
            'max-w-[88%] whitespace-pre-wrap wrap-anywhere rounded-2xl px-3.5 py-2.5',
            'text-[length:var(--fs-text-sm)] leading-[1.75]',
            fromStudent
              ? 'rounded-ss-md border border-line-subtle bg-surface-2 text-fg'
              : /*
                 * A WASH, not the solid amber أيمن's replies carry. Both are
                 * "not the student", and the difference between them is the
                 * difference between a person and a machine — which is the one
                 * distinction this panel must never blur.
                 */
                'rounded-se-md border border-accent/20 bg-[color-mix(in_oklab,var(--a-9)_9%,transparent)] text-fg',
          )}
        >
          {/*
            A TEXT NODE. No markdown parser, no `dangerouslySetInnerHTML`, and
            no `MessageBody` link-splitting either — that exists because أيمن
            sends WhatsApp invitations whose whole payload is a URL, and this
            side generates its own text. The absence of an HTML sink is the
            control here, exactly as it is on the thread.
          */}
          {message.text}
          {streaming ? (
            <span
              aria-hidden="true"
              className="ask-caret ms-0.5 inline-block h-[0.9em] w-[0.45em] translate-y-[0.1em] rounded-[1px] bg-accent"
            />
          ) : null}
        </div>
      ) : null}

      {message.error ? (
        <p
          role="alert"
          className="px-1 text-[length:var(--fs-text-xs)] text-[color:var(--err)]"
        >
          {message.error === 'tooMany' ? c.tooMany : c.failed}
        </p>
      ) : null}

      {/*
        «ده سؤال لأيمن».
        
        Raised by the answer itself — the model emits a marker the server
        strips, see `SentinelFilter` — so it appears on the questions that
        genuinely need a person and not on every message. The way to him is
        also permanently in the panel's footer; this is the version that
        arrives already knowing what was asked.
      */}
      {message.escalate && !streaming ? (
        <m.div
          initial={motionPresets.fadeUp.initial}
          animate={motionPresets.fadeUp.animate}
          className="mt-1 w-full rounded-xl border border-accent/35 bg-accent/10 p-3"
        >
          <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.escalateTitle}</p>
          <p className="mt-1 text-[length:var(--fs-text-xs)] leading-[1.7] text-fg-muted">
            {c.escalateBody}
          </p>
          <button
            type="button"
            onClick={() => onEscalate(lastAsked)}
            className={cn(
              'mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2',
              'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
              'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
            )}
          >
            <Send className="size-3.5" aria-hidden="true" />
            {c.escalateAction}
          </button>
        </m.div>
      ) : null}
    </li>
  );
}
