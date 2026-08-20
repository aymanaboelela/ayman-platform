import Anthropic from '@anthropic-ai/sdk';
import type {
  AnswerProvider,
  ProviderChunk,
  ProviderRequest,
} from './answer-provider';

/**
 * Claude, through the official SDK.
 *
 * ## Not the default, and still here
 *
 * The default is `GeminiProvider` because the requirement was «حاجة مجانية».
 * This one is what «الردود مش مظبوطة» costs to fix: one key in the
 * environment, no code change, no deploy shape change. Deleting it would make
 * that a project instead of a variable — and the file is a hundred lines that
 * nothing else depends on.
 *
 * ## Why the SDK here when Gemini next door is raw `fetch`
 *
 * Three things this call needs that the SDK already has and a `fetch` would
 * have to grow: `cache_control` on a system block (the corpus is identical for
 * every student, and the discount is the difference between affordable and
 * not), typed errors so a 429 is distinguishable from a 400 without matching
 * strings, and abort plumbing that actually cancels the upstream generation.
 */

/** Support answers are short and grounded; `effort: 'low'` is the shape of that. */
const MODEL = 'claude-opus-5';
const MAX_TOKENS = 1024;

export class AnthropicProvider implements AnswerProvider {
  readonly id = `anthropic:${MODEL}`;
  private readonly client: Anthropic;

  constructor(apiKey: string, timeoutMs: number) {
    /*
     * An explicit key or nothing. A bare constructor would let the SDK resolve
     * an operator's personal `ant auth login` profile off the deployment
     * host's disk — a fine default for a script someone runs by hand, and the
     * wrong one for a server, where "who is paying for this" has to be a
     * deliberate environment decision rather than whatever credential happened
     * to be on the box.
     */
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async *answer(request: ProviderRequest): AsyncGenerator<ProviderChunk> {
    const stream = this.client.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        /*
         * `low`, and thinking left adaptive rather than disabled. Answering a
         * grounded FAQ is not a reasoning task, and effort is the supported
         * knob for that — turning thinking off on this model is documented to
         * leak `<thinking>` tags into the visible text, which here is the chat
         * bubble.
         */
        output_config: { effort: 'low' },
        thinking: { type: 'adaptive' },
        system: [
          {
            type: 'text',
            text: request.system,
            /*
             * The instructions and the whole corpus, cached. This prefix is
             * identical for every student on the platform, so the second
             * question of any five-minute window reads it at roughly a tenth
             * of the price. Everything variable is below it — see the service,
             * which is why `system` and `context` are separate fields on
             * `ProviderRequest` rather than one string.
             */
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: request.context },
        ],
        messages: [
          ...request.history.map((turn) => ({ role: turn.role, content: turn.text })),
          { role: 'user' as const, content: request.question },
        ],
      },
      { signal: request.signal },
    );

    for await (const event of stream) {
      if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') continue;
      yield { kind: 'text', text: event.delta.text };
    }

    /*
     * A safety decline is a 200 with `stop_reason: 'refusal'`, not a thrown
     * error, and it can arrive with no text at all — which is why it is read
     * AFTER the loop rather than from any event in it.
     */
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') yield { kind: 'refused' };
  }
}
