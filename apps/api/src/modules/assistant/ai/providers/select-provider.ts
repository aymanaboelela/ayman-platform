import { loadEnv } from '../../../../config/env';
import type { AnswerProvider } from './answer-provider';
import { AnthropicProvider } from './anthropic.provider';
import { ChainProvider } from './chain.provider';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';

/**
 * Whichever provider this deployment is configured for.
 *
 * Shared by المساعد and the YouTube studio's «اقترح لي», so a stack has ONE
 * answer to «which model writes for us» and one set of keys to rotate. Each
 * caller passes its own wall-clock ceiling.
 *
 * Read ONCE, at construction. A per-request read would let a key rotated in
 * `.env` take effect without a restart, which sounds like a feature until the
 * chat starts answering from two different models depending on when the
 * process last happened to look.
 */
export function selectAnswerProvider(timeoutMs: number): AnswerProvider | null {
  const env = loadEnv(process.env);

  /** `"a, b,"` in a hand-edited `.env` is a two-model chain, not an empty one. */
  const list = (value: string, fallback: string): string[] => {
    const names = value.split(',').map((name) => name.trim()).filter(Boolean);
    return names.length > 0 ? names : [fallback];
  };

  /*
   * ORDER IS THE DESIGN, and it is quality-first rather than quota-first.
   *
   * Gemini answers the best Egyptian Arabic of the three and runs out after
   * twenty questions; Groq answers fourteen thousand and sounds slightly less
   * like a person from Cairo. Putting Gemini first spends the good answers on
   * the earliest questions of the day and lets the rest still be answered —
   * see `ChainProvider` for why it can only switch before the first byte.
   *
   * Anthropic is last because it is the only one that costs money: it should
   * never be reached while a free tier still has room.
   */
  const providers: AnswerProvider[] = [];
  if (env.GEMINI_API_KEY) {
    providers.push(
      new GeminiProvider(
        env.GEMINI_API_KEY,
        list(env.GEMINI_MODEL, 'gemini-2.5-flash'),
        timeoutMs,
      ),
    );
  }
  if (env.GROQ_API_KEY) {
    providers.push(
      new GroqProvider(
        env.GROQ_API_KEY,
        list(env.GROQ_MODEL, 'llama-3.3-70b-versatile'),
        timeoutMs,
      ),
    );
  }
  if (env.ANTHROPIC_API_KEY) {
    providers.push(new AnthropicProvider(env.ANTHROPIC_API_KEY, timeoutMs));
  }

  if (providers.length === 0) return null;
  // One provider is not worth a wrapper — and the log line reads better.
  return providers.length === 1 ? providers[0]! : new ChainProvider(providers);
}
