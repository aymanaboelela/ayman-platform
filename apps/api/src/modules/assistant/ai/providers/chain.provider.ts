import type { AnswerProvider, ProviderChunk, ProviderRequest } from './answer-provider';

/**
 * Several providers, tried in order, as if they were one.
 *
 * ## Why a chain and not a choice
 *
 * The free tiers are not interchangeable — they are good at opposite things:
 *
 *   Gemini — the best Egyptian Arabic available for nothing, and **20 answers
 *            a day** on a free project. Measured; see `groq.provider.ts`.
 *   Groq   — 14,400 answers a day, on models that are good at Arabic rather
 *            than excellent.
 *
 * Picking one means either a chat that runs out before second period or a chat
 * that never sounds quite right. Chaining them means the first twenty
 * questions of the day get the best answer available and the next fourteen
 * thousand still get one — which is the actual requirement: «حاجة تبقى من غير
 * فلوس ومن غير كوتة».
 *
 * ## ⚠️ It only ever moves on before the first byte
 *
 * Same rule as the model list inside each provider, and it matters more here:
 * once a chunk has reached the student the answer is half-written on screen,
 * and starting a different PROVIDER would splice two different models' replies
 * into one bubble. So a provider that fails after it has started streaming
 * fails the whole request — the service catches that and shows what arrived
 * with an error under it, which is the honest outcome.
 */
export class ChainProvider implements AnswerProvider {
  readonly id: string;

  constructor(private readonly providers: readonly AnswerProvider[]) {
    this.id = providers.map((provider) => provider.id).join(' ⇢ ');
  }

  async *answer(request: ProviderRequest): AsyncGenerator<ProviderChunk> {
    const failures: string[] = [];

    for (const [index, provider] of this.providers.entries()) {
      const last = index === this.providers.length - 1;
      let started = false;

      try {
        for await (const chunk of provider.answer(request)) {
          started = true;
          yield chunk;
        }
        return;
      } catch (error) {
        /*
         * The reader left. Not a provider failure, and trying the next one
         * would be spending somebody's quota on an answer nobody will read.
         */
        if (request.signal?.aborted) throw error;

        // Already on screen — see the note above. Nothing can be retried.
        if (started || last) throw error;

        failures.push(`${provider.id}: ${error instanceof Error ? error.message : 'failed'}`);
      }
    }

    // Unreachable: the loop either returns, or rethrows on the last provider.
    throw new Error(failures.join(' | ') || 'no provider configured');
  }
}
