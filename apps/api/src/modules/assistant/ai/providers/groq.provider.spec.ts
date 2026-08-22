import { readChunk } from './groq.provider';

/**
 * The OpenAI-shaped wire format, tested without a key and without a network.
 *
 * Same reasoning as `gemini.provider.spec.ts`: `choices[0].delta.content` is a
 * string the compiler cannot check, and getting it wrong produces no error
 * anywhere — the provider yields nothing, the service reads that as "the model
 * said nothing", and the student silently gets the written fallback. A
 * configured provider behaving exactly like an unconfigured one is the worst
 * failure this code has.
 */

describe('readChunk — Groq / OpenAI-shaped', () => {
  it('reads a token out of the delta', () => {
    expect(
      readChunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'أهلا' } }] }),
    ).toEqual({ kind: 'text', text: 'أهلا' });
  });

  /*
   * The first chunk of an OpenAI stream carries the role and no content, and
   * the last carries a finish reason and no content. Both are ordinary and
   * must produce nothing rather than an empty bubble.
   */
  it('ignores the role-only opener and the finish-only closer', () => {
    expect(readChunk({ choices: [{ delta: { role: 'assistant' } }] })).toBeNull();
    expect(readChunk({ choices: [{ delta: {}, finish_reason: 'stop' }] })).toBeNull();
  });

  it('reports a content filter as a refusal, not as an error', () => {
    expect(readChunk({ choices: [{ delta: {}, finish_reason: 'content_filter' }] })).toEqual({
      kind: 'refused',
    });
  });

  /**
   * ⚠️ THE LEAK GUARD.
   *
   * `gpt-oss` reasons before it answers and streams that reasoning in its own
   * `delta.reasoning` field — verified against the live endpoint. Reading it
   * would put «1. Identify Core Concept… 4. Check Constraints» into a student's
   * chat bubble, which is exactly what `qwen/qwen3.6-27b` does and why it is
   * not in the default chain.
   */
  it('never reads the reasoning field into the answer', () => {
    expect(
      readChunk({ choices: [{ delta: { reasoning: 'the user is asking about loops' } }] }),
    ).toBeNull();

    // …and when both arrive, only the answer is taken.
    expect(
      readChunk({ choices: [{ delta: { reasoning: 'thinking…', content: 'الرد' } }] }),
    ).toEqual({ kind: 'text', text: 'الرد' });
  });

  it('ignores anything that is not a chunk', () => {
    expect(readChunk({ choices: [] })).toBeNull();
    expect(readChunk({})).toBeNull();
    expect(readChunk(null)).toBeNull();
    expect(readChunk('[DONE]')).toBeNull();
  });
});
