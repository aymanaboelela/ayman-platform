import { SentinelFilter, openingWithUser } from './assistant-ai.service';
import type { AskTurn } from '@ayman/contracts/assistant/ask';
import { KNOWLEDGE, catalogBlock, knowledgeBlock, matchKnowledge } from './assistant-knowledge';

/**
 * The two pieces of المساعد's chat that are pure logic, tested without a model
 * and without a network.
 *
 * Everything else in `AssistantAiService` is an SDK call and the error
 * branches around it. What is worth a test here is the marker filter — the one
 * place a bug shows up as garbage inside a student's chat bubble — and the
 * retrieval that answers when there is no key at all, which is what CI and
 * every unconfigured deployment actually run.
 */

describe('SentinelFilter', () => {
  it('passes ordinary text straight through', () => {
    const filter = new SentinelFilter();
    expect(filter.push('الكورس فيه وحدات ')).toBe('الكورس فيه وحدات ');
    expect(filter.push('وكل وحدة فيها دروس.')).toBe('وكل وحدة فيها دروس.');
    expect(filter.flush()).toBe('');
    expect(filter.found).toBe(false);
  });

  it('removes the marker and reports it', () => {
    const filter = new SentinelFilter();
    expect(filter.push('مش عارف. [[ASK_AYMAN]]')).toBe('مش عارف. ');
    expect(filter.flush()).toBe('');
    expect(filter.found).toBe(true);
  });

  /*
   * The reason this class exists. Tokens arrive in slices the model chooses,
   * so the marker lands split far more often than not — and a filter that
   * looked at one chunk at a time would ship `[[ASK` into the bubble.
   */
  it('removes a marker split across chunks, one character at a time', () => {
    const filter = new SentinelFilter();
    let out = filter.push('السعر بيتغير. ');
    for (const character of '[[ASK_AYMAN]]') out += filter.push(character);
    out += filter.flush();

    expect(out).toBe('السعر بيتغير. ');
    expect(filter.found).toBe(true);
  });

  it('holds back only what could still become the marker', () => {
    const filter = new SentinelFilter();
    // `[[` could be the start of it, so it waits.
    expect(filter.push('تمام [[')).toBe('تمام ');
    // …and it turns out not to be.
    expect(filter.push('كده')).toBe('[[كده');
    expect(filter.flush()).toBe('');
    expect(filter.found).toBe(false);
  });

  it('releases a genuine trailing bracket on flush', () => {
    const filter = new SentinelFilter();
    expect(filter.push('شوف الكود [[')).toBe('شوف الكود ');
    expect(filter.flush()).toBe('[[');
    expect(filter.found).toBe(false);
  });

  it('survives the marker twice', () => {
    const filter = new SentinelFilter();
    expect(filter.push('أ [[ASK_AYMAN]] ب [[ASK_AYMAN]] ج')).toBe('أ  ب  ج');
    expect(filter.found).toBe(true);
  });
});

describe('openingWithUser', () => {
  const user = (text: string): AskTurn => ({ role: 'user', text });
  const bot = (text: string): AskTurn => ({ role: 'assistant', text });

  it('leaves a well-formed history alone', () => {
    const history = [user('أ'), bot('ب'), user('ج')];
    expect(openingWithUser(history)).toEqual(history);
  });

  /*
   * The case that would 400 the whole answer. The widget drops turns that
   * failed before it slices the tail, so an odd-length tail beginning on an
   * answer is reachable from one flaky request mid-conversation — and the
   * student would read the API's rejection as «حصلت مشكلة في الرد».
   */
  it('trims a leading answer rather than rejecting the request', () => {
    expect(openingWithUser([bot('ب'), user('ج'), bot('د')])).toEqual([user('ج'), bot('د')]);
  });

  it('drops a history that is answers all the way down', () => {
    expect(openingWithUser([bot('ب'), bot('د')])).toEqual([]);
  });

  it('handles an empty history', () => {
    expect(openingWithUser([])).toEqual([]);
  });
});

describe('the knowledge corpus', () => {
  /*
   * The corpus is DERIVED from `copy.assistant.script`, so the failure this
   * guards is a re-shaped tree quietly emptying it — which would look like a
   * model that suddenly knows nothing about the platform, with no error
   * anywhere.
   */
  it('is built from the written script and is not empty', () => {
    expect(KNOWLEDGE.length).toBeGreaterThan(8);
    for (const entry of KNOWLEDGE) {
      expect(entry.question.length).toBeGreaterThan(0);
      expect(entry.answer.length).toBeGreaterThan(0);
    }
  });

  it('carries no menu nodes — a question is not a fact', () => {
    // «تمام. السؤال عن الكورسات في إيه بالظبط؟» is a prompt, not an answer.
    expect(KNOWLEDGE.some((entry) => entry.id === 'courses')).toBe(false);
    expect(KNOWLEDGE.some((entry) => entry.id === 'root')).toBe(false);
    expect(KNOWLEDGE.some((entry) => entry.id === 'studyQuizzes')).toBe(true);
  });

  it('renders one block per fact', () => {
    const block = knowledgeBlock();
    expect(block).toContain('س: ');
    expect(block).toContain('ج: ');
    expect(block).toContain(KNOWLEDGE[0]!.answer);
  });

  it('says so plainly when nothing is published', () => {
    expect(catalogBlock([])).toContain('مفيش كورس منشور');
  });
});

describe('matchKnowledge — the answer when there is no model', () => {
  it('finds the quiz answer from a student’s own wording', () => {
    expect(matchKnowledge('الكويزات دي شكلها ايه؟')?.id).toBe('studyQuizzes');
  });

  /*
   * ⚠️ The exact string `assistant.e2e.ts` types into the panel.
   *
   * That test asserts the browser gets `copy.assistant.script.studyQuizzes`
   * back, which is only deterministic because CI has no model and this
   * function answers instead. If a re-worded node changed the match, the
   * failure would land in a Playwright shard — twenty minutes away, on the
   * job that gates the deploy — instead of here, in a hundred milliseconds.
   */
  it('answers the question the browser test types, verbatim', () => {
    expect(matchKnowledge('الكويزات شكلها إيه؟')?.id).toBe('studyQuizzes');
  });

  it('finds the password answer', () => {
    expect(matchKnowledge('نسيت كلمة السر اعمل ايه')?.id).toBe('accountPassword');
  });

  it('routes a price question at the node that refuses to name a number', () => {
    expect(matchKnowledge('الكورس بكام؟')?.id).toBe('joinPrice');
  });

  /*
   * The threshold, and the whole reason there is one. Every entry in the
   * corpus contains «كورس»; without a floor, a question sharing only that word
   * would be answered with whichever paragraph happened to sort first — a
   * confident wrong answer, which is worse than «مش عارف».
   */
  it('returns null rather than the least-bad paragraph', () => {
    expect(matchKnowledge('عايز أروح المريخ')).toBeNull();
    expect(matchKnowledge('؟؟؟')).toBeNull();
    expect(matchKnowledge('')).toBeNull();
  });
});
