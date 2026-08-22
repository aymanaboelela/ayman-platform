import type {
  AnswerProvider,
  ProviderChunk,
  ProviderRequest,
} from './answer-provider';
import { drainSse, sseData } from './answer-provider';

/**
 * Groq, over its OpenAI-compatible endpoint.
 *
 * ## Why this exists beside Gemini
 *
 * VOLUME. Gemini answers better Egyptian Arabic, and on a free project it
 * answers it **20 times a day** — measured, not guessed: the quota violation
 * names itself `GenerateRequestsPerDayPerProjectPerModel-FreeTier` with a
 * value of 20, and every `*-flash-lite` model (the ones with the four-figure
 * allowances) returns 404 on a key issued today, including the one Google's
 * own error message tells you to switch to.
 *
 * Twenty answers is a demo. A single class asking one question each exhausts
 * it before second period. Groq's free tier is 14,400 requests a day with no
 * card — three orders of magnitude more — on models that are merely good at
 * Arabic rather than excellent.
 *
 * So the two are CHAINED rather than chosen between: Gemini spends its twenty
 * best answers first, and Groq carries the rest of the day. See
 * `selectProvider`. Neither is asked to be what the other is.
 *
 * ## Why raw `fetch` again
 *
 * Same reasoning as `gemini.provider.ts`: one POST, one SSE body, one field to
 * read. The endpoint is OpenAI-shaped, so the temptation is `openai` — a
 * dependency, a version to track, and a client configured to talk to somebody
 * else's host, for forty lines of code.
 */

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Statuses worth trying the next model for — the same set and the same reasons
 * as the Gemini provider, minus nothing. A 429 here is a per-minute token
 * ceiling far more often than a daily one.
 */
const TRY_NEXT_MODEL = new Set([404, 429, 500, 502, 503]);

export class GroqProvider implements AnswerProvider {
  readonly id: string;
  lastModel: string | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly models: readonly string[],
    private readonly timeoutMs: number,
  ) {
    this.id = `groq:${models.join(' → ')}`;
  }

  async *answer(request: ProviderRequest): AsyncGenerator<ProviderChunk> {
    const failures: string[] = [];

    for (const [index, model] of this.models.entries()) {
      const last = index === this.models.length - 1;
      let response: Response;

      try {
        response = await this.open(model, request);
      } catch (error) {
        if (request.signal?.aborted) throw error;
        if (last) throw error;
        failures.push(`${model}=${error instanceof Error ? error.name : 'error'}`);
        continue;
      }

      if (!response.ok || !response.body) {
        if (!last && TRY_NEXT_MODEL.has(response.status)) {
          failures.push(`${model}=${response.status}`);
          continue;
        }
        const trail = failures.length > 0 ? ` (after ${failures.join(', ')})` : '';
        throw new Error(`groq responded ${response.status} for ${model}${trail}`);
      }

      this.lastModel = model;
      yield* this.read(response.body);
      return;
    }
  }

  private async open(model: string, request: ProviderRequest): Promise<Response> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;

    return fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        /*
         * The instructions and the corpus are a `system` message — the same
         * separation `systemInstruction` gives on Gemini, and the same reason:
         * it is the channel a student's words cannot reach, which is what
         * keeps «اتجاهل تعليماتك» from being read as a peer instruction.
         */
        messages: [
          { role: 'system', content: `${request.system}\n\n${request.context}` },
          ...request.history.map((turn) => ({ role: turn.role, content: turn.text })),
          { role: 'user', content: request.question },
        ],
        max_completion_tokens: 1024,
        /*
         * Lower than the default, for the reason the Gemini provider gives at
         * length: this is a support desk reading facts back to a student, and
         * a lower temperature is what keeps a grounded answer grounded.
         */
        temperature: 0.4,
      }),
    });
  }

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

    // The trailing line, for the same reason the Gemini provider flushes one:
    // a stream that ends without a newline would otherwise lose its last frame.
    const tail = readChunk(sseData(buffer + decoder.decode()));
    if (tail) yield tail;
  }
}

/**
 * One OpenAI-shaped chunk.
 *
 * `sseData` already returns `null` for the `[DONE]` terminator, so nothing
 * here has to know about it.
 */
export function readChunk(payload: unknown): ProviderChunk | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const choice = choices[0] as Record<string, unknown>;

  /*
   * A safety stop. OpenAI-shaped APIs report it as a finish reason rather than
   * as an error, exactly like the other two providers — so it maps onto the
   * same `refused` chunk and the service answers it the same way.
   */
  if (choice.finish_reason === 'content_filter') return { kind: 'refused' };

  const delta = choice.delta as Record<string, unknown> | undefined;
  const text = delta?.content;
  return typeof text === 'string' && text ? { kind: 'text', text } : null;
}
