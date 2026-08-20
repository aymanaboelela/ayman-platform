import { drainSse, sseData } from './answer-provider';
import { GeminiProvider, readChunk } from './gemini.provider';

/**
 * The wire format, tested without a key and without a network.
 *
 * ## Why this file exists at all
 *
 * Every field name below — `candidates`, `content.parts[].text`,
 * `finishReason`, `promptFeedback.blockReason` — is a string this repo cannot
 * check by compiling. Get one wrong and there is no error anywhere: the
 * provider yields no chunks, the service reads that as "nothing came back",
 * and the student gets the written fallback with «أكلّم م. أيمن» under it.
 * A configured model silently behaving exactly like an unconfigured one is the
 * worst failure this feature has, because the only symptom is answers that are
 * a bit worse than expected.
 *
 * The shapes here are the documented ones (ai.google.dev/api/generate-content),
 * and the endpoint, model path and `x-goog-api-key` header were verified
 * against the live API with a deliberately invalid key: it answered
 * `API_KEY_INVALID` rather than rejecting the URL or the body.
 */

describe('the SSE frame reader', () => {
  /*
   * ⚠️ THE SHAPE BELOW IS CAPTURED, NOT IMAGINED — and the difference between
   * those two took this feature down for a whole session.
   *
   * The first version of this file asserted `'data: {…}\n\ndata: {…}'`: the
   * blank line the SSE spec puts between events, and what every example in
   * every doc shows. It passed. Gemini does not send it. A real captured
   * response to a real question is 1363 bytes containing ONE `data:` line,
   * zero `\n\n` sequences and zero carriage returns — the stream just ends.
   *
   * So the reader is line-based now, and these tests are written against what
   * came off the wire. A test that agrees with the documentation and disagrees
   * with the server is worse than no test: it is a reason to look somewhere
   * else for a whole afternoon.
   */
  it('keeps the last line back, because more of it may be coming', () => {
    const { events, rest } = drainSse('data: {"a":1}\ndata: {"b":2');
    expect(events).toEqual(['data: {"a":1}']);
    expect(rest).toBe('data: {"b":2');
  });

  it('emits nothing at all for a single unterminated line', () => {
    // The captured shape. Everything is in `rest`, which is why the provider
    // MUST pass it through once the reader is done — see the flush there.
    const { events, rest } = drainSse('data: {"a":1}');
    expect(events).toEqual([]);
    expect(rest).toBe('data: {"a":1}');
  });

  it('treats a blank separator line as nothing, not as a frame', () => {
    const { events } = drainSse('data: {"a":1}\n\ndata: {"b":2}\n');
    expect(events).toEqual(['data: {"a":1}', '', 'data: {"b":2}']);
    expect(sseData('')).toBeNull();
  });

  it('reads one payload', () => {
    expect(sseData('data: {"a":1}')).toEqual({ a: 1 });
  });

  it('tolerates CRLF even though this server does not send it', () => {
    expect(sseData('data: {"a":1}\r')).toEqual({ a: 1 });
  });

  it('ignores keep-alives, comments and the terminator', () => {
    expect(sseData(': ping')).toBeNull();
    expect(sseData('data: [DONE]')).toBeNull();
    expect(sseData('data:')).toBeNull();
  });

  it('survives a truncated payload rather than throwing mid-answer', () => {
    expect(sseData('data: {"a":')).toBeNull();
  });
});

describe('readChunk', () => {
  const text = (value: string) => ({
    candidates: [{ content: { parts: [{ text: value }] } }],
  });

  it('reads the text out of a candidate', () => {
    expect(readChunk(text('الكورس فيه وحدات'))).toEqual({
      kind: 'text',
      text: 'الكورس فيه وحدات',
    });
  });

  it('joins multiple parts of one chunk', () => {
    expect(
      readChunk({ candidates: [{ content: { parts: [{ text: 'أ' }, { text: 'ب' }] } }] }),
    ).toEqual({ kind: 'text', text: 'أب' });
  });

  /*
   * `STOP` and `MAX_TOKENS` are ordinary endings. Reading either as a refusal
   * would replace a complete answer with «ده مش حاجة أقدر أساعد فيها» — on the
   * LAST chunk of every successful reply.
   */
  it('treats a normal finish as text, not as a refusal', () => {
    expect(readChunk({ candidates: [{ content: { parts: [{ text: 'تمام' }] }, finishReason: 'STOP' }] })).toEqual({
      kind: 'text',
      text: 'تمام',
    });
    expect(readChunk({ candidates: [{ finishReason: 'MAX_TOKENS' }] })).toBeNull();
  });

  it('reports a blocked prompt as a refusal', () => {
    expect(readChunk({ promptFeedback: { blockReason: 'SAFETY' } })).toEqual({ kind: 'refused' });
  });

  it('reports an answer stopped for safety as a refusal', () => {
    expect(readChunk({ candidates: [{ finishReason: 'SAFETY' }] })).toEqual({ kind: 'refused' });
    expect(readChunk({ candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] })).toEqual({
      kind: 'refused',
    });
  });

  it('ignores a chunk carrying only usage metadata', () => {
    expect(readChunk({ usageMetadata: { promptTokenCount: 10 } })).toBeNull();
    expect(readChunk({ candidates: [] })).toBeNull();
    expect(readChunk(null)).toBeNull();
    expect(readChunk('nonsense')).toBeNull();
  });
});

/**
 * The model chain — what makes a free tier survive a school day.
 *
 * The daily quota is per project PER MODEL (`GenerateRequestsPerDayPerProject
 * PerModel` is Google's own quota id), so a 429 on one model says nothing
 * about the next. Walking a short list turns one key into several allowances.
 *
 * `fetch` is stubbed rather than hit: what is being asserted is which statuses
 * move on and which stop, and that is a decision this file makes on its own.
 */
describe('GeminiProvider — falling down the model list', () => {
  const ORIGINAL = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = ORIGINAL;
  });

  /** A response that streams one Gemini frame, in the real captured shape. */
  function streaming(text: string): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: {"candidates":[{"content":{"parts":[{"text":${JSON.stringify(text)}}]}}]}`,
          ),
        );
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }

  function stub(...responses: Response[]) {
    const calls: string[] = [];
    let index = 0;
    globalThis.fetch = jest.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      const next = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return next!;
    }) as unknown as typeof fetch;
    return calls;
  }

  async function drain(provider: GeminiProvider): Promise<string> {
    let out = '';
    for await (const chunk of provider.answer({
      system: 's',
      context: 'c',
      history: [],
      question: 'q',
    })) {
      if (chunk.kind === 'text') out += chunk.text;
    }
    return out;
  }

  it('uses the first model when it answers', async () => {
    const calls = stub(streaming('تمام'));
    const provider = new GeminiProvider('k', ['a', 'b'], 5000);
    await expect(drain(provider)).resolves.toBe('تمام');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/models/a:');
    expect(provider.lastModel).toBe('a');
  });

  it('moves to the next model when the first is out of quota', async () => {
    const calls = stub(new Response('', { status: 429 }), streaming('أهلا'));
    const provider = new GeminiProvider('k', ['a', 'b'], 5000);
    await expect(drain(provider)).resolves.toBe('أهلا');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('/models/b:');
    expect(provider.lastModel).toBe('b');
  });

  /*
   * 404 is what a key that cannot see a model answers — measured on a real
   * restricted key, which listed the model and then refused to run it. "This
   * key does not have that one" is exactly a reason to try the other.
   */
  it('moves on from a model this key cannot reach', async () => {
    stub(new Response('', { status: 404 }), streaming('ماشي'));
    const provider = new GeminiProvider('k', ['a', 'b'], 5000);
    await expect(drain(provider)).resolves.toBe('ماشي');
    expect(provider.lastModel).toBe('b');
  });

  /*
   * A bad key answers 400 identically for every model in the list. Retrying
   * would turn one clear failure into three slow ones and delay the written
   * fallback the student is waiting for.
   */
  it('stops immediately on an error every model would repeat', async () => {
    const calls = stub(new Response('', { status: 400 }), streaming('never'));
    const provider = new GeminiProvider('k', ['a', 'b'], 5000);
    await expect(drain(provider)).rejects.toThrow(/400/);
    expect(calls).toHaveLength(1);
  });

  it('reports the whole trail when every model is exhausted', async () => {
    stub(new Response('', { status: 429 }));
    const provider = new GeminiProvider('k', ['a', 'b'], 5000);
    // The log line has to say which models were tried, or «الردود بقت وحشة»
    // and «خلصت الحصة» look identical from the outside.
    await expect(drain(provider)).rejects.toThrow(/a=429/);
  });
});
