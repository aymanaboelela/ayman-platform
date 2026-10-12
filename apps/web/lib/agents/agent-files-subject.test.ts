import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';

/**
 * The agent-facing documents — `/llms.txt`, `/AGENTS.md`, the ARD manifest and
 * the markdown twins — read as OUTPUT, on the three kinds of stack.
 *
 * ## Why output and not a reading of the code
 *
 * These are the files an assistant quotes as fact about a stack. The leaks
 * they carried were never in the code a reviewer reads first: Ayman's CV in
 * `instructorWhy` sat one `.map()` below a correctly gated line, and every
 * example query in the ARD manifest said «برمجة» on a physics teacher's
 * domain. So each case composes the document the route would serve and reads
 * it for the strings that must, and must not, be there.
 *
 * The loaders are stubbed (an empty catalogue, no articles, the books feature
 * on): what is under test is the text each route composes, not the API.
 */
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/lib/catalog', () => ({ getCatalogOrEmpty: async () => ({ courses: [] }) }));
vi.mock('@/lib/news', () => ({ getNewsListOrEmpty: async () => ({ posts: [] }) }));
vi.mock('@/lib/entitlements', () => ({ getEntitlements: async () => ({ books: true }) }));

const KEYS = ['TENANT_KEY', 'TENANT_DISPLAY_NAME', 'TENANT_SUBJECT'] as const;
type Env = Partial<Record<(typeof KEYS)[number], string>>;

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
  vi.resetModules();
});

function setEnv(env: Env) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  vi.resetModules();
}

async function llmsTxt(env: Env): Promise<string> {
  setEnv(env);
  const { GET } = await import('@/app/llms.txt/route');
  return (await GET()).text();
}

async function agentsMd(env: Env): Promise<string> {
  setEnv(env);
  const { GET } = await import('@/app/AGENTS.md/route');
  return (await GET()).text();
}

async function aiCatalog(env: Env): Promise<{ entries: { representativeQueries: string[] }[] }> {
  setEnv(env);
  const { GET } = await import('@/app/.well-known/ai-catalog.json/route');
  return (await GET()).json();
}

const AYMAN: Env = {};
const SABRY: Env = { TENANT_KEY: 'mohamed-sabry', TENANT_DISPLAY_NAME: 'منصة محمد صبري' };
const PHYSICS: Env = {
  TENANT_KEY: 'demo',
  TENANT_DISPLAY_NAME: 'م. محمد حسن',
  TENANT_SUBJECT: 'physics',
};

/** Programming, in any of the words these documents used for it. */
const CODE = /برمج|بايثون|Python|JavaScript|علوم الحاسب|computer science/i;

/** Lines from his CV — the claims no other stack may make. */
const HIS_CV = [...copy.seo.instructorWhy, copy.seo.instructorCoverage, copy.landing.aboutBody3];

describe('/llms.txt', () => {
  it('is his, CV and all, on his stack', async () => {
    const text = await llmsTxt(AYMAN);
    expect(text).toContain(`### ${copy.llms.whyHim}`);
    for (const line of HIS_CV) expect(text).toContain(line);
    expect(text).toContain('/essentials.md');
    expect(text).toContain(copy.site.tagline);
  });

  it('carries none of his CV on another programming stack — and stays programming', async () => {
    const text = await llmsTxt(SABRY);
    expect(text).not.toContain(copy.llms.whyHim);
    for (const line of HIS_CV) expect(text).not.toContain(line);
    expect(text).toContain(copy.site.tagline);
    expect(text).toContain('/essentials.md');
  });

  it('names physics and nothing about code on a physics stack', async () => {
    const text = await llmsTxt(PHYSICS);
    expect(text).toContain('الفيزياء');
    expect(text).not.toMatch(CODE);
    expect(text).not.toContain('/essentials.md');
  });
});

describe('/AGENTS.md', () => {
  it('describes his audience and his CV on his stack', async () => {
    const text = await agentsMd(AYMAN);
    expect(text).toContain('Students in the Egyptian **Bakalorya** system');
    expect(text).toContain('## Why this instructor, specifically');
    for (const line of HIS_CV.slice(0, -1)) expect(text).toContain(line);
  });

  it('claims none of his facts on another programming stack', async () => {
    const text = await agentsMd(SABRY);
    expect(text).not.toContain('**Bakalorya**');
    expect(text).not.toContain('## Why this instructor, specifically');
    for (const line of HIS_CV) expect(text).not.toContain(line);
    expect(text).toContain('taking البرمجة وعلوم الحاسب');
  });

  it('names physics and nothing about code on a physics stack', async () => {
    const text = await agentsMd(PHYSICS);
    expect(text).toContain('taking الفيزياء');
    expect(text).not.toMatch(CODE);
  });
});

describe('/.well-known/ai-catalog.json', () => {
  const queries = (manifest: { entries: { representativeQueries: string[] }[] }) =>
    manifest.entries.flatMap((entry) => entry.representativeQueries);

  it('keeps every programming query on a programming stack', async () => {
    expect(queries(await aiCatalog(AYMAN))).toContain('سعر كورس البرمجة والذكاء الاصطناعي بكالوريا');
    expect(queries(await aiCatalog(SABRY))).toContain('كورس برمجة ٢ بكالوريا');
  });

  it('asks registries about physics, never about code, on a physics stack', async () => {
    const all = queries(await aiCatalog(PHYSICS));
    expect(all).toContain('سعر كورس الفيزياء ثانوي');
    for (const query of all) expect(query, query).not.toMatch(CODE);
  });
});

describe('the markdown twins', () => {
  async function render(env: Env) {
    setEnv(env);
    return import('./markdown-render');
  }

  it('publish his biography on /about.md on his stack only', async () => {
    const ayman = (await render(AYMAN)).renderAboutMarkdown();
    expect(ayman).toContain(copy.landing.aboutBody2);
    expect(ayman).toContain(copy.landing.aboutBody3);

    const sabry = (await render(SABRY)).renderAboutMarkdown();
    expect(sabry).not.toContain(copy.landing.aboutBody2);
    expect(sabry).not.toContain(copy.landing.aboutBody3);
    for (const credit of copy.landing.aboutCredits) expect(sabry).not.toContain(credit.note);
  });

  it('publish the instructor’s OWN biography where they wrote one, as the page does', async () => {
    const { renderAboutMarkdown } = await render(SABRY);
    const markdown = renderAboutMarkdown({
      bioAr: 'سيرة كتبها المدرّس بنفسه.',
      credits: [{ labelAr: 'درس فين؟', noteAr: 'كلية العلوم' }],
    });
    expect(markdown).toContain('سيرة كتبها المدرّس بنفسه.');
    expect(markdown).toContain('### درس فين؟\n\nكلية العلوم');
  });

  it('say physics and nothing about code on a physics stack', async () => {
    const twins = await render(PHYSICS);
    const home = twins.renderHomeMarkdown([]);
    const about = twins.renderAboutMarkdown();
    const courses = twins.renderCoursesMarkdown([]);
    for (const markdown of [home, about, courses]) {
      expect(markdown).toContain('الفيزياء');
      expect(markdown).not.toMatch(CODE);
    }
    expect(home).not.toContain('/essentials');
  });
});
