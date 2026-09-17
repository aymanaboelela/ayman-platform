'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import Link from 'next/link';
import { m } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  CornerDownLeft,
  Loader2,
  RotateCcw,
  Send,
  Square,
  UserRound,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { ASK_QUESTION_MAX, type AskAction } from '@ayman/contracts/assistant/ask';
/*
 * TYPE-ONLY, both of them — `@ayman/contracts/assistant/conversation` carries
 * Zod and this file is dynamically imported precisely to keep it off the
 * critical path. An `import type` is erased, so neither costs a byte.
 */
import type { AssistantTranscriptTurn } from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui/lib/cn';
import * as motionPresets from '@ayman/ui/motion';
import { AssistantRobot } from './assistant-robot';
import type { HandoffState } from './assistant-handoff';
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
  transcriptRef,
  handoff,
  onEscalate,
  onNewQuestion,
  onOpenHandoffForm,
  onOpenThread,
}: {
  /**
   * The widget's window onto this transcript.
   *
   * A REF, written in the scroll effect below, and not a `onChange` prop. The
   * widget needs the exchange at exactly two moments — a handoff, and a press
   * on «أكلّم م. أيمن» in the footer — and both are events, not renders.
   * Lifting the transcript into state up there would re-render the whole panel
   * on every streamed token to keep a copy nobody is looking at.
   */
  transcriptRef: RefObject<AssistantTranscriptTurn[]>;
  /** Where the handoff has got to — the card under the answer draws it. */
  handoff: HandoffState;
  /**
   * «المساعد وقف هنا».
   *
   * Fired AUTOMATICALLY the moment an answer finishes carrying المساعد's own
   * «ده لأيمن» marker, and again if somebody presses the card's button after a
   * failure. The widget decides what that means — a signed-in student's
   * question goes straight to the inbox, a guest is asked for a number first.
   */
  onEscalate: (question: string) => void;
  /**
   * «الطالب سأل حاجة تانية» — so whatever `handoff` says is about the previous
   * exchange and must go back to `idle`.
   *
   * The widget owns that state and only ever advances it, so without this the
   * second escalating answer rendered the FIRST one's receipt. See `askFresh`
   * below for the frame that produced and for why it is an event.
   */
  onNewQuestion: () => void;
  /** The form, for a guest and for a retry. */
  onOpenHandoffForm: () => void;
  /** The thread it landed in, once it has. */
  onOpenThread: () => void;
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
    /*
     * The widget's copy of the exchange, kept current here because this effect
     * already runs on every change to it. A ref write is not a render, so this
     * costs nothing and there is no second source of truth to drift: the ref
     * is a VIEW of `messages`, rebuilt from it, never appended to.
     *
     * Half-written and failed turns are dropped, for the same reason
     * `useAssistantAsk` drops them from the history it sends up: a paragraph
     * المساعد never finished is not something it said, and putting it in front
     * of أيمن as if it were would have him answering for a sentence that does
     * not exist.
     */
    transcriptRef.current = messages
      .filter((message) => message.error === null && message.text.trim().length > 0)
      .map((message) => ({ role: message.role, text: message.text }));

    // Nothing to follow yet. Without this the empty state scrolls itself to
    // the bottom on mount and the reader opens the panel onto the disclaimer,
    // with the robot and the first two openers already above the fold.
    if (messages.length === 0) return;
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [written, messages, transcriptRef]);

  /**
   * The last answer المساعد has already handed over, so it is handed over once.
   *
   * A ref rather than state: nothing on screen reads it — the card renders
   * from `handoff`, which the WIDGET owns — and a `setState` here would be the
   * "commit, then immediately re-render" that `react-hooks/set-state-in-effect`
   * exists to catch.
   */
  const handedOff = useRef<number | null>(null);
  const last = messages.at(-1);
  const escalating = last?.escalate === true && !busy;

  /**
   * Ask, having first told the widget that its `handoff` state is stale.
   *
   * ⚠️ THIS EXISTS BECAUSE THE SECOND HANDOFF SHOWED THE FIRST ONE'S RECEIPT.
   *
   * `handoff` is one value in the widget and it is only ever ADVANCED — idle →
   * sending → sent — never reset between answers. The card renders on
   * `message.escalate && !streaming && handoff`, and all three were already
   * true for the second escalating answer the instant it finished streaming,
   * a frame before the effect below fired. So the student read «الرسالة راحت
   * لم. أيمن» about a message that had not been sent, and watched it turn back
   * into «بنوصّل…» — a receipt printed before its own transaction.
   *
   * Clearing it HERE, on the question rather than on the answer, is what makes
   * the state belong to the exchange on screen. `idle` renders nothing at all
   * (see `HandoffCard`), so the gap between an answer landing and its handoff
   * starting is blank, which is what it was designed to be and what it already
   * was for the very first question.
   *
   * An event handler and not an effect, deliberately: this is «the student
   * asked something new», which is an event, and the same lint rule above
   * would refuse it written the other way.
   */
  const askFresh = useCallback(
    (question: string) => {
      onNewQuestion();
      ask(question);
    },
    [ask, onNewQuestion],
  );

  /*
   * ── THE HANDOFF HAPPENS BY ITSELF ────────────────────────────────────
   *
   * «لما ميعرفش يجاوب، لازم السؤال يوصله هو». It used to be a button on a
   * card, and a button is a thing a fifteen-year-old can decline to press: the
   * answer said «اسأل م. أيمن», the student read that as «I have been turned
   * away», and the question أيمن most needed to see was the one that never
   * arrived.
   *
   * So the answer arriving IS the handoff. المساعد says it is sending the
   * message and then the message is sent — the card below reports what
   * happened rather than asking permission for it. The «second screen» is gone
   * for everybody the platform already has a phone number for; a guest still
   * has to leave one, which is the one case a promise cannot be kept without.
   */
  useEffect(() => {
    if (!escalating || !last) return;
    // Once per answer. Ids come from a counter that «مسح» does not reset, so
    // a cleared chat cannot re-use one and re-file an exchange.
    if (handedOff.current === last.id) return;
    handedOff.current = last.id;
    onEscalate(lastQuestion(messages, last.id));
  }, [escalating, last, messages, onEscalate]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const question = draft.trim();
    if (!question) return;
    setDraft('');
    askFresh(question);
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
    askFresh(question);
    inputRef.current?.focus();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
       * `min-h-0`, and the 13rem floor only once there is room for it.
       *
       * A `min-height` on a flex item is a REFUSAL TO SHRINK, so on a short
       * panel — a phone with the keyboard open is the case that matters — the
       * transcript held its 208px and pushed the composer below the panel's
       * bottom edge, where `overflow-hidden` cut it off. The box you type in
       * disappeared because the box above it would not give up any room.
       *
       * The floor is still worth having above `sm`: without it a two-line
       * conversation collapses the transcript to the height of its content and
       * the panel visibly grows with each answer.
       */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:min-h-[13rem]">
        {messages.length === 0 ? (
          <Welcome onPick={askStarter} />
        ) : (
          <ol className="flex flex-col gap-3.5">
            {messages.map((message) => (
              <Bubble
                key={message.id}
                message={message}
                streaming={busy && message.id === last?.id}
                /*
                  The card belongs to the LATEST answer and to no other.
                  It used to render on every message that had ever escalated,
                  so a student who asked a second question was left looking at
                  a live «ابعت لأيمن» attached to a handoff that had already
                  happened — and at two of them after a third.

                  This half alone was NOT enough: `handoff` is one shared
                  value that only moves forward, so the newest answer rendered
                  the PREVIOUS handoff's receipt for the frame between «the
                  answer finished» and «the effect fired». `askFresh` above is
                  the other half — it puts the state back to `idle` when the
                  question is asked, so what this gate lets through is always
                  about the exchange on screen.
                */
                handoff={message.id === last?.id ? handoff : null}
                onOpenHandoffForm={onOpenHandoffForm}
                onOpenThread={onOpenThread}
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
                // The cleared chat's handoff is not this chat's — same reason
                // as `askFresh`, at the other moment the exchange changes.
                onNewQuestion();
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
  handoff,
  onOpenHandoffForm,
  onOpenThread,
}: {
  message: ChatMessage;
  streaming: boolean;
  /** `null` on every message that is not the latest — see the call site. */
  handoff: HandoffState | null;
  onOpenHandoffForm: () => void;
  onOpenThread: () => void;
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

      {message.actions.length > 0 && !streaming ? (
        <AnswerActions actions={message.actions} />
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
        «ده سؤال لأيمن» — a RECEIPT now, not a request.

        Raised by the answer itself: the model emits a marker the server strips
        (see `SentinelFilter`), so it appears on the questions that genuinely
        need a person and not on every message. What changed is what it says.
        The handoff has already happened by the time this renders — the effect
        above fires on the same condition — so the card reports where the
        question got to.

        The one branch that still asks for something is `needsIdentity`, and it
        asks for the only thing the platform cannot supply on a guest's behalf:
        somewhere to send the answer.
      */}
      {message.escalate && !streaming && handoff ? (
        <m.div
          initial={motionPresets.fadeUp.initial}
          animate={motionPresets.fadeUp.animate}
          className="mt-1 w-full rounded-xl border border-accent/35 bg-accent/10 p-3"
          // `status` and not `alert`: it is the expected outcome of a question,
          // announced once, and it must not interrupt a screen reader that is
          // still reading the answer it sits under.
          role="status"
        >
          <HandoffCard
            state={handoff}
            onOpenHandoffForm={onOpenHandoffForm}
            onOpenThread={onOpenThread}
          />
        </m.div>
      ) : null}
    </li>
  );
}

/**
 * What the card says, in each of the four states it can be read in.
 *
 * Split out of `Bubble` because it is a five-way branch over ONE prop and
 * nothing else — no message, no streaming, no reaction — and reading the
 * bubble's geometry should not mean reading past it.
 *
 * `idle` renders nothing at all: it is the gap between the answer finishing
 * and the effect above firing, which is one frame, and a card that flashed
 * «ابعت لأيمن» for a frame before replacing itself with «بنبعت…» would read as
 * a glitch.
 */
function HandoffCard({
  state,
  onOpenHandoffForm,
  onOpenThread,
}: {
  state: HandoffState;
  onOpenHandoffForm: () => void;
  onOpenThread: () => void;
}) {
  if (state === 'idle') return null;

  if (state === 'sending') {
    return (
      <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
        <Loader2
          className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {c.handoffSending}
      </p>
    );
  }

  if (state === 'sent') {
    return (
      <>
        <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)] font-medium text-fg">
          <CheckCircle2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
          {c.handoffSentTitle}
        </p>
        <p className="mt-1 text-[length:var(--fs-text-xs)] leading-[1.7] text-fg-muted">
          {c.handoffSentBody}
        </p>
        {/*
          A way to the thread, not an instruction to go there. The answer comes
          back with a notification and the launcher grows a dot, so nobody has
          to sit on this screen waiting — the link is for the student who wants
          to see that their words actually arrived.
        */}
        <button
          type="button"
          onClick={onOpenThread}
          className="mt-2 text-[length:var(--fs-text-sm)] text-accent-text hover:underline"
        >
          {c.handoffOpenThread}
        </button>
      </>
    );
  }

  /*
   * `needsIdentity` and `failed` share a shape — a sentence and the button
   * into the form — and differ only in what the sentence says. A guest is not
   * being told something went wrong, because nothing did.
   */
  const failed = state === 'failed';
  return (
    <>
      <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">
        {failed ? c.handoffFailedTitle : c.handoffIdentityTitle}
      </p>
      <p className="mt-1 text-[length:var(--fs-text-xs)] leading-[1.7] text-fg-muted">
        {failed ? c.handoffFailedBody : c.handoffIdentityBody}
      </p>
      <button
        type="button"
        onClick={onOpenHandoffForm}
        className={cn(
          'mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2',
          'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
          'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
        )}
      >
        <Send className="size-3.5" aria-hidden="true" />
        {c.escalateAction}
      </button>
    </>
  );
}

/**
 * Where the answer points — «زرار يروح للمكان اللي سأل عليه».
 *
 * ## Links, drawn as buttons
 *
 * Real `<Link>`s and not `onClick` handlers, because these are navigations and
 * a student who middle-clicks «الكتب وأسعارها» to keep the chat open should
 * get a new tab rather than nothing. That is also what makes them survive a
 * long-press menu, a copy-link, and a screen reader's list of links. They are
 * STYLED as the primary affordance they are — the answer's conclusion, not a
 * footnote under it.
 *
 * ## What is deliberately not here
 *
 * No `target="_blank"`: an internal route in a new tab loses the app shell's
 * client-side navigation and leaves two copies of the platform open on a
 * phone. And no icon per destination — three different icons on three pills in
 * a 300px panel is decoration competing with the words that carry the meaning.
 *
 * The arrow is `ArrowLeft` and that is CORRECT under RTL: forward is leftward
 * in Arabic, which is the same reason `message-body.tsx` points its WhatsApp
 * card the same way.
 *
 * Every `href` here has already been through `asAskActions` — nothing renders
 * that is not a route this app serves, so there is no dead button to guard
 * against at this level.
 */
function AnswerActions({ actions }: { actions: readonly AskAction[] }) {
  return (
    <m.nav
      aria-label={c.actionsLabel}
      initial={motionPresets.fadeUp.initial}
      animate={motionPresets.fadeUp.animate}
      className="mt-1 flex w-full flex-wrap justify-end gap-1.5"
    >
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className={cn(
            'group inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5',
            'border-accent/40 bg-accent/12 text-[length:var(--fs-text-xs)] font-medium text-fg',
            'transition-colors duration-[160ms] ease-out hover:border-accent/60 hover:bg-accent/20',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--a-9)]',
          )}
        >
          {action.label}
          <ArrowLeft
            aria-hidden="true"
            className="size-3.5 shrink-0 text-accent-text transition-transform duration-[160ms] ease-out group-hover:-translate-x-0.5"
          />
        </Link>
      ))}
    </m.nav>
  );
}
