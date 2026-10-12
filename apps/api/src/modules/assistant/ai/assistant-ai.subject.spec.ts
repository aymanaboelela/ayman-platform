/*
 * Mocked for the reason `assistant-ai.service.spec.ts` gives: importing the
 * service is enough to need `loadEnv`, and none of this is about it.
 */
jest.mock('../../../config/env', () => ({ loadEnv: () => ({}) }));

import { copy } from '@ayman/contracts/copy';

/**
 * المساعد's prompt and corpus, on the three kinds of stack — asserted as the
 * TEXT the model is sent.
 *
 * ## Why this matters more than a page
 *
 * The prompt was written for a programming platform, and on a physics
 * teacher's stack its refusal rule — «Never answer questions unrelated to this
 * platform or to computer science» — was an instruction to refuse PHYSICS, the
 * one subject the student is there for. A page that says the wrong subject is
 * a defect a reader sees; a prompt that says it is a chatbot politely declining
 * to help with the lesson.
 *
 * ## …and the constraint it runs under
 *
 * Every programming stack keeps its prompt byte for byte: it is a cached prefix,
 * and his students' answers must not move. The lines below are the original
 * text, copied, so a reword of either half shows up here.
 *
 * `IS_AYMAN` and `TEACHES_CODE` are decided at module load, so each case resets
 * the registry and re-requires — the shape `assistant-knowledge.tenant.spec.ts`
 * uses.
 */
const KEYS = ['TENANT_KEY', 'TENANT_DISPLAY_NAME', 'TENANT_SUBJECT'] as const;
type Env = Partial<Record<(typeof KEYS)[number], string>>;

type ServiceModule = typeof import('./assistant-ai.service');
type KnowledgeModule = typeof import('./assistant-knowledge');

function loadWith(env: Env): ServiceModule & KnowledgeModule {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const service = require('./assistant-ai.service') as ServiceModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const knowledge = require('./assistant-knowledge') as KnowledgeModule;
  return { ...service, ...knowledge };
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

const AYMAN: Env = {};
const SABRY: Env = { TENANT_KEY: 'mohamed-sabry', TENANT_DISPLAY_NAME: 'منصة محمد صبري' };
const PHYSICS: Env = { TENANT_KEY: 'demo', TENANT_DISPLAY_NAME: 'م. محمد حسن', TENANT_SUBJECT: 'physics' };

/** The programming lines, verbatim from the prompt every programming stack sends. */
const CODE_SCOPE =
  '2. QUESTIONS ABOUT THE SUBJECT — programming and computer science at Egyptian secondary level. Explaining a concept (متغيّر، حلقة، دالة، مصفوفة، قاعدة بيانات…) in two or three simple sentences with a tiny example is welcome and is a large part of why this chat exists.';
const CODE_REFUSAL =
  '- Never answer questions unrelated to this platform or to computer science — politics, religion, medicine, personal advice. One friendly line saying what you are for, and stop.';
const CODE_PAIRS =
  '- Two of the pairs below are the SAME page in two different shells. books/store is one shop and essentials/foundations is one set of lessons';

describe('the prompt on a programming stack', () => {
  it.each([
    ['Ayman', AYMAN],
    ['Sabry', SABRY],
  ])('%s keeps every programming line exactly', (_name, env) => {
    const { SYSTEM } = loadWith(env);
    expect(SYSTEM).toContain(CODE_SCOPE);
    expect(SYSTEM).toContain(CODE_REFUSAL);
    expect(SYSTEM).toContain(CODE_PAIRS);
    expect(SYSTEM).toContain(`an Egyptian secondary-school platform for ${copy.site.tagline}.`);
    for (const id of ['essentials', 'foundations', 'playground']) {
      expect(SYSTEM).toContain(`\n${id} — ${copy.assistant.ai.actions[id as 'essentials']}`);
    }
  });

  it('names his button with his title, on his stack only', () => {
    expect(loadWith(AYMAN).SYSTEM).toContain(`«أكلّم م. ${copy.site.instructor}»`);
  });

  it('names another instructor’s button without a title it never claimed', () => {
    const { SYSTEM } = loadWith(SABRY);
    expect(SYSTEM).not.toContain('«أكلّم م.');
    expect(SYSTEM).toContain(`«أكلّم ${SABRY.TENANT_DISPLAY_NAME}»`);
  });
});

describe('the prompt on a physics stack', () => {
  it('scopes the chat to physics, and refuses nothing about it', () => {
    const { SYSTEM } = loadWith(PHYSICS);
    expect(SYSTEM).toContain('2. QUESTIONS ABOUT THE SUBJECT — الفيزياء, the one subject this platform teaches');
    expect(SYSTEM).toContain('unrelated to this platform or to الفيزياء');
    expect(SYSTEM).not.toContain('computer science');
    expect(SYSTEM).not.toMatch(/متغيّر، حلقة، دالة/);
  });

  it('says what the platform is for in its own words', () => {
    const { SYSTEM } = loadWith(PHYSICS);
    expect(SYSTEM).toContain('an Egyptian secondary-school platform for الفيزياء — المرحلة الثانوية.');
    expect(SYSTEM).not.toContain(copy.site.tagline);
  });

  it('offers no destination this stack does not have', () => {
    const { SYSTEM } = loadWith(PHYSICS);
    for (const id of ['essentials', 'foundations', 'playground']) {
      expect(SYSTEM).not.toContain(`\n${id} — `);
    }
    expect(SYSTEM).not.toContain('essentials/foundations');
    expect(SYSTEM).toContain('books/store is one shop');
  });

  it('drops the corpus entries that describe a programming platform', () => {
    const { KNOWLEDGE } = loadWith(PHYSICS);
    const ids = KNOWLEDGE.map((entry) => entry.id);
    for (const id of ['playground', 'essentials', 'startWhere']) expect(ids).not.toContain(id);
    for (const entry of KNOWLEDGE) {
      expect(`${entry.question} ${entry.answer}`).not.toMatch(/برمج|كود|بايثون|Python/);
    }
  });

  it('answers «المنصة دي بتاعة إيه؟» with physics', () => {
    const { KNOWLEDGE } = loadWith(PHYSICS);
    expect(KNOWLEDGE.find((entry) => entry.id === 'platform')?.answer).toContain('الفيزياء');
  });
});

describe('the corpus on a programming stack', () => {
  it('keeps the programming entries', () => {
    for (const env of [AYMAN, SABRY]) {
      const ids = loadWith(env).KNOWLEDGE.map((entry) => entry.id);
      for (const id of ['playground', 'essentials', 'startWhere']) expect(ids).toContain(id);
    }
  });
});
