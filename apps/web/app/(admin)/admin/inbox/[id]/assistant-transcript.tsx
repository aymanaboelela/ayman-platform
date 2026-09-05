import { Bot, UserRound } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import type { AssistantTranscriptTurn } from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui';
import { inboxTimeFormatter } from '../status-chip';

const c = copy.assistant.inbox;

/**
 * «محتاج أشوف الشات كامل عشان أعرف هو سأل على إيه» — the conversation المساعد
 * had before it gave up, drawn as a record rather than as a message.
 *
 * ## Why this is not a bubble
 *
 * It arrives in the thread as an ordinary `visitor` row, because the author
 * enum has two members and a third is a migration (see
 * `serializeAssistantTranscript`). Drawn as a bubble it would be a wall of
 * marks in the student's own colour, on the student's own side, and he would
 * read a machine's answers as things a fifteen-year-old had typed at him. The
 * whole point of the handoff is that he can tell at a glance who said what.
 *
 * So it is a CARD: no side, no tail, no reaction, muted rather than tinted,
 * and every turn labelled in words. It reads as an attachment to the
 * conversation, which is exactly what it is.
 *
 * ## A SERVER component, and nothing here needs to change that
 *
 * There is no reaction, no edit and no delete on a transcript — none of the
 * three mean anything on a record neither participant wrote — so unlike
 * `MessageBubble` this stays off the client entirely. The parse happens on the
 * server too, in the page, where it costs nothing.
 */
export function AssistantTranscript({
  turns,
  trimmed,
  createdAt,
}: {
  turns: readonly AssistantTranscriptTurn[];
  /** Older turns were dropped to fit the cap — say so rather than imply it. */
  trimmed: boolean;
  createdAt: string;
}) {
  return (
    <li className="flex flex-col gap-1">
      <div className="w-full max-w-[min(42rem,100%)] overflow-hidden rounded-2xl border border-dashed border-line bg-surface-1">
        {/*
          The header does the whole job of distinguishing this from the
          conversation around it — dashed border, no accent, and a sentence
          saying in words that nobody wrote this TO him.
        */}
        <div className="border-b border-line-subtle bg-surface-2 px-4 py-2.5">
          <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)] font-semibold text-fg">
            <Bot className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            {c.transcriptTitle}
          </p>
          <p className="mt-0.5 text-[length:var(--fs-text-xs)] leading-[1.6] text-fg-muted">
            {c.transcriptNote}
          </p>
        </div>

        {trimmed ? (
          <p className="border-b border-line-subtle px-4 py-2 text-[length:var(--fs-text-xs)] text-fg-faint">
            {c.transcriptTrimmed}
          </p>
        ) : null}

        {/*
          A definition list, not a list of bubbles: the label is the point.
          `sm:grid-cols-[auto_1fr]` puts the two-word label in its own column
          on anything wider than a phone, so the eye can run down one edge and
          find every «المساعد» without reading a word of the text beside it.
        */}
        <dl className="flex flex-col">
          {turns.map((turn, index) => {
            const fromStudent = turn.role === 'user';
            return (
              <div
                // The index IS the identity here: a transcript is immutable
                // once written, nothing reorders and nothing is inserted.
                key={index}
                className={cn(
                  'grid gap-x-3 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[7rem_1fr]',
                  index > 0 ? 'border-t border-line-subtle' : '',
                  // The student's turns carry the tint. His words are what he
                  // is scanning for; المساعد's are the context around them.
                  fromStudent ? 'bg-surface-2/40' : '',
                )}
              >
                <dt className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
                  {fromStudent ? (
                    <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Bot className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  {fromStudent ? c.transcriptStudent : c.transcriptBot}
                </dt>
                {/*
                  `wrap-anywhere` for the same reason every other bubble on this
                  screen has it: a student can paste a 200-character URL, and
                  one unbreakable token pushes the whole card off the side.

                  A TEXT NODE, deliberately — no `MessageBody`, no link
                  splitting. That component exists because أيمن sends WhatsApp
                  invitations; nothing in a transcript is his, and turning a URL
                  a stranger typed into a live link on an admin screen is a
                  thing to do on purpose or not at all.
                */}
                <dd className="wrap-anywhere text-[length:var(--fs-text-sm)] leading-[1.75] text-fg">
                  {turn.text}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {/* The same stamp every other message in the thread carries, so the
          card sits in the timeline rather than beside it. */}
      <time
        dateTime={createdAt}
        className="mono px-1 text-[length:var(--fs-mono-label)] text-fg-faint"
      >
        {inboxTimeFormatter.format(new Date(createdAt))}
      </time>
    </li>
  );
}
