import { drainSse, sseData } from './answer-provider';
import { readChunk } from './gemini.provider';

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
