import type {
  AnswerProvider,
  ProviderChunk,
  ProviderRequest,
} from './answer-provider';
import { drainSse, sseData } from './answer-provider';

/**
 * Google's Gemini, over plain REST.
 *
 * ## Why this one is the default
 *
 * «أنا مش معايا أي AI، أنا عايز حاجة مجانية». Gemini is the only free tier
 * that is all three of: genuinely free (a key from AI Studio, no card), good
 * at EGYPTIAN Arabic rather than merely at Arabic, and reachable without a
 * dependency. The whole client is the `fetch` below.
 *
 * ## Why raw `fetch` and not `@google/genai`
 *
 * One POST, one SSE body, one field to read. An SDK here would add a
 * dependency to the API image, a second version to keep current, and a layer
 * between this file and the shape the docs describe — for a call that is
 * forty lines. `@anthropic-ai/sdk` next door earns its place differently: it
 * carries prompt-cache semantics, typed errors and abort plumbing this code
 * would otherwise reimplement.
 *
 * ## The key goes in a HEADER
 *
 * `?key=` is the shape most examples use and it is the wrong one for a server:
 * a query string ends up in access logs, in error reporters, and in any proxy
 * between here and Google. `x-goog-api-key` is the documented header form and
 * costs nothing.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Statuses worth trying the NEXT model for.
 *
 * ⚠️ The free daily quota is per PROJECT **per MODEL** — the quota id Google
 * returns says so outright: `GenerateRequestsPerDayPerProjectPerModel`. So a
 * 429 on one model says nothing at all about the next one, and walking down a
 * short list is free capacity from the same key with no extra setup for
 * whoever configured it.
 *
 * `404` is in the list and belongs there: it is what a key that cannot see a
 * particular model answers, and "this key does not have that one" is exactly a
 * reason to try the other. `503` is Google's overload, which is transient and
 * common on the newest models.
 *
 * Deliberately NOT here: 400, 401, 403. Those are the request or the key being
 * wrong, and every model in the list would answer them identically — retrying
 * would turn one clear failure into four slow ones.
 */
const TRY_NEXT_MODEL = new Set([404, 429, 500, 503]);

export class GeminiProvider implements AnswerProvider {
  readonly id: string;
  /** Which model actually answered last. Read by the service for the log line. */
  lastModel: string | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly models: readonly string[],
    private readonly timeoutMs: number,
  ) {
    this.id = `gemini:${models.join(' → ')}`;
  }

  async *answer(request: ProviderRequest): AsyncGenerator<ProviderChunk> {
    const failures: string[] = [];

    for (const [index, model] of this.models.entries()) {
      const last = index === this.models.length - 1;
      let response: Response;

      try {
        response = await this.open(model, request);
      } catch (error) {
        /*
         * A network-level failure, or the caller aborting. An abort must NOT
         * walk to the next model — the reader is gone and every further
         * request is spend for nobody — so it is rethrown immediately and the
         * service recognises it.
         */
        if (request.signal?.aborted) throw error;
        if (last) throw error;
        failures.push(`${model}=${error instanceof Error ? error.name : 'error'}`);
        continue;
      }

      if (!response.ok || !response.body) {
        /*
         * ⚠️ Safe to retry ONLY because nothing has been yielded yet. Once a
         * single chunk has reached the browser the answer is half-written on
         * screen, and starting a different model would splice two replies into
         * one bubble. The loop therefore only ever moves on from a response
         * that failed before its body was read.
         */
        if (!last && TRY_NEXT_MODEL.has(response.status)) {
          failures.push(`${model}=${response.status}`);
          continue;
        }
        const trail = failures.length > 0 ? ` (after ${failures.join(', ')})` : '';
        throw new Error(`gemini responded ${response.status} for ${model}${trail}`);
      }

      this.lastModel = model;
      yield* this.read(response.body);
      return;
    }
  }

  /** One attempt at one model. Returns the raw response, ok or not. */
  private async open(model: string, request: ProviderRequest): Promise<Response> {
    /*
     * The caller's abort (a closed tab, «إيقاف») AND a wall-clock ceiling, as
     * one signal. `fetch` has no default timeout, and "no ceiling" is a
     * browser holding an open connection with a typing indicator on it
     * forever — the same failure `lib/api.ts` documents on the web side.
     *
     * Built per attempt: a timeout signal is one-shot, and reusing an expired
     * one would abort the next model before it was asked anything.
     */
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;

    return fetch(
      `${ENDPOINT}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          /*
           * The instructions and the corpus go in `systemInstruction`, not as
           * a first user turn. Gemini treats it as a separate, higher-priority
           * channel — which is what keeps «اتجاهل تعليماتك» in a student's
           * message from being read as a peer instruction — and it is also the
           * part that repeats byte-for-byte across every request, so implicit
           * context caching has something stable to hit.
           */
          systemInstruction: { parts: [{ text: `${request.system}\n\n${request.context}` }] },
          contents: [
            ...request.history.map((turn) => ({
              // Gemini's word for the assistant is `model`; `assistant` is a
              // 400. The mapping lives here and nowhere else.
              role: turn.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: turn.text }],
            })),
            { role: 'user', parts: [{ text: request.question }] },
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            /*
             * Below the default. This is a support desk reading facts back to
             * a student, not a writing task — and a lower temperature is what
             * keeps a grounded answer grounded rather than embellished.
             */
            temperature: 0.4,
            /*
             * ⚠️ THINKING OFF, and this is not a micro-optimisation.
             *
             * 2.5-flash thinks by default. Measured against the live API on a
             * one-sentence question — «المنصة دي بتاعة إيه؟» — that default
             * spent 485 thinking tokens to produce 17 tokens of answer: 522
             * total instead of 29, and seconds instead of under one. Every one
             * of those tokens comes out of a FREE tier that a class of thirty
             * shares, to reason about a fact that is written verbatim in the
             * prompt three lines above.
             *
             * Retrieval-and-rephrase is the whole job here. If a future model
             * needs reasoning for it, the fix is a different model, not a
             * budget — this route is not where a hard question belongs.
             */
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
  }

  /**
   * The body, as chunks.
   *
   * Takes the STREAM rather than the response: the caller has already checked
   * `response.body` is there, and passing the response would make this method
   * re-narrow a thing that cannot be null by the time it is called.
   */
  private async *read(body: ReadableStream<Uint8Array>): AsyncGenerator<ProviderChunk> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = drainSse(buffer);
      buffer = rest;

      for (const line of events) {
        const chunk = readChunk(sseData(line));
        if (chunk) yield chunk;
      }
    }

    /*
     * ⚠️ THE LAST LINE, which has no newline after it.
     *
     * Without this the final frame is dropped — and on a short answer Gemini
     * sends exactly ONE frame and no trailing newline, so "the final frame"
     * is the entire reply. That was the whole bug: a clean 200, a full body,
     * and not a single chunk yielded, on every request.
     */
    const tail = readChunk(sseData(buffer + decoder.decode()));
    if (tail) yield tail;
  }
}

/**
 * One SSE payload, narrowed by hand.
 *
 * Deliberately not a Zod schema: this is a hot loop that runs once per token,
 * the shape is three levels of optional, and every unexpected field is
 * something to ignore rather than something to reject. A response that no
 * longer carries text simply produces no chunks, and the service's
 * "nothing came back" branch answers from the corpus — which is the same
 * behaviour a schema failure would need, arrived at without the throw.
 */
export function readChunk(payload: unknown): ProviderChunk | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as Record<string, unknown>;

  /*
   * The prompt itself was blocked, so there are no candidates at all. This
   * arrives as a 200 — it is a decision, not an error — and the service turns
   * it into a polite line rather than a retry on another model.
   */
  const feedback = body.promptFeedback as Record<string, unknown> | undefined;
  if (feedback && typeof feedback.blockReason === 'string') return { kind: 'refused' };

  const candidates = body.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const candidate = candidates[0] as Record<string, unknown>;

  // The ANSWER was stopped part-way for safety. `STOP` and `MAX_TOKENS` are
  // ordinary endings and must not land here.
  const finish = candidate.finishReason;
  if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'BLOCKLIST') {
    return { kind: 'refused' };
  }

  const content = candidate.content as Record<string, unknown> | undefined;
  const parts = content?.parts;
  if (!Array.isArray(parts)) return null;

  const text = parts
    .map((part) => (part as Record<string, unknown>).text)
    .filter((value): value is string => typeof value === 'string')
    .join('');

  return text ? { kind: 'text', text } : null;
}
