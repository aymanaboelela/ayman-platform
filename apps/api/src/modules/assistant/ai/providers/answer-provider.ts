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
 * Splits an SSE body into complete LINES, keeping any partial tail.
 *
 * ⚠️ LINE-based, not `\n\n`-based, and that distinction cost a whole debugging
 * session. This function used to split on the blank line the SSE spec puts
 * between events — which is what every example in every doc shows, and what a
 * test written from those examples happily confirms.
 *
 * Gemini does not send it. A captured response to a real question is 1363
 * bytes containing exactly one `data:` line, ZERO `\n\n` sequences and zero
 * carriage returns; the stream simply ends. So the old version never once
 * decided a frame was complete, the buffer was silently discarded when the
 * reader finished, and the provider yielded nothing — on every request, with a
 * clean 200 and no error anywhere. The service read that as "the model said
 * nothing" and answered from the written corpus instead, which looks exactly
 * like a working feature whose answers happen to be word-for-word identical to
 * the corpus.
 *
 * Splitting on `\n` and keeping the last (possibly incomplete) piece handles
 * both framings — one blank line between events just produces an empty piece,
 * which `sseData` ignores — and it is what `useAssistantAsk` should be read
 * against too: chunks arrive on network boundaries, not message ones, so a
 * `data:` line routinely lands cut in half.
 *
 * ⚠️ The caller MUST pass whatever is left in `rest` through `sseData` once
 * the stream ends. On a single-frame response, that leftover is the entire
 * answer.
 */
export function drainSse(buffer: string): { events: string[]; rest: string } {
  const lines = buffer.split('\n');
  // The last piece has no newline after it yet, so more of it may be coming.
  const rest = lines.pop() ?? '';
  return { events: lines, rest };
}

/** The JSON payload of one `data:` line, or `null` for a blank line, a comment or a keep-alive. */
export function sseData(line: string): unknown {
  // `\r` for a server that does use CRLF — Gemini does not, but the spec says
  // it may, and stripping it costs nothing.
  const trimmed = line.replace(/\r$/, '');
  if (!trimmed.startsWith('data:')) return null;
  const body = trimmed.slice(5).trim();
  if (!body || body === '[DONE]') return null;
  try {
    return JSON.parse(body);
  } catch {
    // A truncated payload is not worth ending an answer over. It should not
    // happen — `drainSse` holds back an unterminated line — but a provider
    // that ends mid-line would otherwise take the whole reply down.
    return null;
  }
}
