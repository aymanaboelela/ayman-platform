import { ChainProvider } from './chain.provider';
import type { AnswerProvider, ProviderChunk } from './answer-provider';

/**
 * The chain across providers — what makes «مجاني ومن غير كوتة» approximately
 * true.
 *
 * Gemini answers the best Arabic and runs out after twenty questions a day;
 * Groq answers fourteen thousand. Chained, the first twenty questions get the
 * better answer and the rest still get one.
 */

const REQUEST = { system: 's', context: 'c', history: [], question: 'q' } as const;

/** A provider that yields the given words, or throws after `failAfter` of them. */
function fake(id: string, words: string[], failAfter?: number): AnswerProvider {
  return {
    id,
    async *answer(): AsyncGenerator<ProviderChunk> {
      for (const [index, text] of words.entries()) {
        if (failAfter !== undefined && index === failAfter) throw new Error(`${id} died`);
        yield { kind: 'text', text };
      }
      if (failAfter === 0) throw new Error(`${id} died`);
    },
  };
}

async function drain(provider: AnswerProvider, signal?: AbortSignal): Promise<string> {
  let out = '';
  for await (const chunk of provider.answer({ ...REQUEST, signal })) {
    if (chunk.kind === 'text') out += chunk.text;
  }
  return out;
}

describe('ChainProvider', () => {
  it('uses the first provider when it works', async () => {
    const chain = new ChainProvider([fake('a', ['أهلا']), fake('b', ['never'])]);
    await expect(drain(chain)).resolves.toBe('أهلا');
  });

  it('falls to the next when the first is out of quota', async () => {
    const chain = new ChainProvider([fake('a', [], 0), fake('b', ['تمام'])]);
    await expect(drain(chain)).resolves.toBe('تمام');
  });

  /**
   * ⚠️ THE RULE THAT MATTERS. Once a chunk has reached the student the answer
   * is half-written on screen, and starting a different provider would splice
   * two models' replies into one bubble. A provider that dies mid-stream fails
   * the whole request — the service shows what arrived with an error under it.
   */
  it('never switches provider once text has been sent', async () => {
    const chain = new ChainProvider([fake('a', ['نص', 'تاني'], 1), fake('b', ['رد تاني'])]);
    await expect(drain(chain)).rejects.toThrow(/a died/);
  });

  it('rethrows the last provider rather than inventing a success', async () => {
    const chain = new ChainProvider([fake('a', [], 0), fake('b', [], 0)]);
    await expect(drain(chain)).rejects.toThrow(/b died/);
  });

  /*
   * The reader left. Trying the next provider would spend somebody's quota on
   * an answer nobody is waiting for.
   */
  it('stops at once when the caller aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const second = fake('b', ['should not run']);
    const spy = jest.spyOn(second, 'answer');
    const chain = new ChainProvider([fake('a', [], 0), second]);

    await expect(drain(chain, controller.signal)).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it('names every provider in its id, so the log says what is configured', () => {
    expect(new ChainProvider([fake('gemini:x', []), fake('groq:y', [])]).id).toBe(
      'gemini:x ⇢ groq:y',
    );
  });
});
