import { copy } from '@ayman/contracts/copy';

/**
 * المساعد's corpus, on a stack that is not his — asserted as OUTPUT, not as
 * mechanism.
 *
 * ## Why this test and not a reading of the code
 *
 * `platformFacts()` was gated first, and a comment was written above it saying
 * so. `writtenFacts()` and `scriptEntries()` sat directly underneath, ungated,
 * handing the model ten written answers and eight tree answers with his name
 * in them — «الأسئلة المقالية بيصحّحها أيمن بنفسه», «أوصّل السؤال لأيمن على
 * طول» — for as long as the comment made the file look handled. A test that
 * asserted «`tenantName` is called here» would have been green the whole time.
 *
 * So this asks the only question worth asking: BUILD THE CORPUS THIS
 * DEPLOYMENT WILL SEND, and read it for his name. It does not care which
 * function did the swapping or whether a fourth source is added next year.
 *
 * ## Why the corpus and not the chat
 *
 * There is no model here, and on a deployment with no API key there is no
 * model there either: `assistant-ai.service.ts` falls back to `matchKnowledge`
 * and returns the matched answer VERBATIM. `knowledgeBlock()` is therefore
 * both the prompt a model reads and, on that path, the words a student reads.
 *
 * `IS_AYMAN` is decided at module load, so each case resets the registry and
 * re-requires — the same shape the web's tenant tests use.
 */

const KEYS = ['TENANT_KEY', 'TENANT_DISPLAY_NAME'] as const;

/** A second instructor's stack, configured the way the runbook says to. */
const OTHER = { TENANT_KEY: 'mohamed-sabry', TENANT_DISPLAY_NAME: 'منصة محمد صبري' };

/**
 * The needles, read out of the copy table rather than typed here.
 *
 * The bare first word is the strict one and the reason this is not just
 * `includes(copy.site.name)`: «بوصّلك لأيمن» carries no surname and would sail
 * past a full-name check while naming him in every answer it appears in.
 */
const NAME_NEEDLES = [
  copy.site.platformName,
  copy.site.instructor,
  copy.site.name,
  copy.site.name.split(' ')[0] ?? copy.site.name,
];

type KnowledgeModule = typeof import('./assistant-knowledge');

function loadWith(env: Partial<Record<(typeof KEYS)[number], string>>): KnowledgeModule {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./assistant-knowledge') as KnowledgeModule;
}

let saved: Partial<Record<(typeof KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  jest.resetModules();
});

describe('the corpus on another instructor’s stack', () => {
  it('carries no spelling of his name, in any entry, question or answer', () => {
    // Collected rather than asserted one at a time: jest's `expect` takes no
    // message argument, and a bare `false` tells you nothing about WHICH entry.
    const { KNOWLEDGE } = loadWith(OTHER);
    const leaking = KNOWLEDGE.flatMap((entry) =>
      NAME_NEEDLES.filter((needle) =>
        `${entry.question}\n${entry.answer}`.includes(needle),
      ).map((needle) => `${entry.id} still says «${needle}»`),
    );
    expect(leaking).toEqual([]);
  });

  it('carries no spelling of his name in the block the model is sent', () => {
    // The assembled string, not the entries — a join could reintroduce it, and
    // this is the exact text that goes on the wire.
    const { knowledgeBlock } = loadWith(OTHER);
    const block = knowledgeBlock();
    for (const needle of NAME_NEEDLES) expect(block.includes(needle)).toBe(false);
  });

  it('drops the entries that state a fact about HIM rather than the product', () => {
    // «مهندس برمجيات شغّال في السوق من ٨ سنين» is a CV. Swapping the name in
    // front of it would publish a career this instructor has not had.
    const { KNOWLEDGE } = loadWith(OTHER);
    const ids = KNOWLEDGE.map((entry) => entry.id);
    for (const personal of copy.assistant.knowledgePersonal) expect(ids).not.toContain(personal);
  });

  it('still answers who runs the place, with this deployment’s own name', () => {
    // Dropping and swapping both have to leave the corpus ABLE TO ANSWER. A
    // student asking «المنصة دي بتاعة إيه؟» on a tenant stack was the original
    // report, and «المنصة» with no name at all would be a quieter version of
    // the same bug.
    const { KNOWLEDGE } = loadWith(OTHER);
    const platform = KNOWLEDGE.find((entry) => entry.id === 'platform');
    expect(platform?.answer).toContain(OTHER.TENANT_DISPLAY_NAME);
  });
});

describe('the corpus on his own stack', () => {
  it('is byte-for-byte the copy table, entry for entry', () => {
    /*
     * The constraint the whole multi-tenant effort runs under: his platform
     * does not change. Asserted against `copy` directly rather than against a
     * snapshot, so re-wording an answer does not need this file re-recorded.
     */
    const { KNOWLEDGE } = loadWith({});
    for (const written of copy.assistant.knowledge) {
      const entry = KNOWLEDGE.find((candidate) => candidate.id === written.id);
      expect(entry?.question).toBe(written.q);
      expect(entry?.answer).toBe(written.a);
    }
  });

  it('keeps the entry about him', () => {
    const { KNOWLEDGE } = loadWith({});
    const ids = KNOWLEDGE.map((entry) => entry.id);
    for (const personal of copy.assistant.knowledgePersonal) expect(ids).toContain(personal);
  });
});
