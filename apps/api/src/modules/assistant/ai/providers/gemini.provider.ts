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

export class GeminiProvider implements AnswerProvider {
  readonly id: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {
    this.id = `gemini:${model}`;
  }

  async *answer(request: ProviderRequest): AsyncGenerator<ProviderChunk> {
    /*
     * The caller's abort (a closed tab, «إيقاف») AND a wall-clock ceiling, as
     * one signal. `fetch` has no default timeout, and "no ceiling" is a
     * browser holding an open connection with a typing indicator on it
     * forever — the same failure `lib/api.ts` documents on the web side.
     */
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;

    const response = await fetch(
      `${ENDPOINT}/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`,
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
          },
        }),
      },
    );

    if (!response.ok || !response.body) {
      /*
       * A 429 from a free tier is the most likely failure here by a wide
       * margin, and it is indistinguishable to the student from any other: the
       * service catches this and answers from the written corpus instead. The
       * status is in the message so the log says which one it was.
       */
      throw new Error(`gemini responded ${response.status}`);
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = drainSse(buffer);
      buffer = rest;

      for (const frame of events) {
        const chunk = readChunk(sseData(frame));
        if (chunk) yield chunk;
      }
    }
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
