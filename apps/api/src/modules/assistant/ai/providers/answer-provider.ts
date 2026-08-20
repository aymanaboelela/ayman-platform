import type { AskTurn } from '@ayman/contracts/assistant/ask';

/**
 * What المساعد needs from a model, and nothing else.
 *
 * ## Why there is an interface here at all
 *
 * Because the answer to "which model" is «اللي مجاني» — and that answer will
 * change. Free tiers get rate-limited, re-priced and withdrawn, and the day
 * one does, the fix has to be a new file in this folder and one environment
 * variable, not a rewrite of the service that owns the prompt, the corpus, the
 * marker filter and the streaming.
 *
 * So everything that is ABOUT المساعد stays in `assistant-ai.service.ts`, and
 * everything that is about one vendor's wire format lives in one file here.
 * A provider receives finished text and yields finished text; it knows nothing
 * about `[[ASK_AYMAN]]`, about the catalog, or about what a student is.
 */

/**
 * One piece of an answer.
 *
 * `refused` rather than a thrown error, because a safety decline is not a
 * failure: every provider returns it as a SUCCESSFUL response with a flag, and
 * the right reaction is a polite stop rather than a retry. Squeezing it into
 * an exception would put it on the same path as a timeout, which wants the
 * opposite handling.
 */
export type ProviderChunk =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'refused' };

export interface ProviderRequest {
  /**
   * The instructions and the whole corpus. Byte-identical on every request, so
   * a provider that can cache a prefix should cache exactly this.
   */
  readonly system: string;
  /** The part that changes every few minutes — today, the published catalog. */
  readonly context: string;
  /** Previous turns, oldest first, guaranteed to start on a `user` turn. */
  readonly history: readonly AskTurn[];
  readonly question: string;
  /** The reader left, or pressed «إيقاف». */
  readonly signal?: AbortSignal;
}

export interface AnswerProvider {
  /** Named in one log line at boot, so «ليه الردود وحشة؟» has an answer. */
  readonly id: string;
  answer(request: ProviderRequest): AsyncGenerator<ProviderChunk>;
}

/**
 * Splits an SSE body into complete events.
 *
 * Both providers below stream `text/event-stream`, and both need this for the
 * same reason `useAssistantAsk` needs its own copy on the browser side: chunks
 * arrive on network boundaries, not message ones, so a `data:` line routinely
 * lands cut in half. Everything after the last `\n\n` is kept for next time.
 */
export function drainSse(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split('\n\n');
  return { events: parts.slice(0, -1), rest: parts.at(-1) ?? '' };
}

/** The JSON payload of one `data:` line, or `null` for a comment or a keep-alive. */
export function sseData(frame: string): unknown {
  const line = frame.split('\n').find((candidate) => candidate.startsWith('data:'));
  if (!line) return null;
  const body = line.slice(5).trim();
  if (!body || body === '[DONE]') return null;
  try {
    return JSON.parse(body);
  } catch {
    // A malformed frame is not worth ending an answer over — and on a
    // half-written stream it is usually the last one, which `drainSse` was
    // supposed to have held back anyway.
    return null;
  }
}
