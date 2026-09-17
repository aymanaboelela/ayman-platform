import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The landing page a deployment serves before anybody has composed one.
 *
 * `STARTER_HOME_BLOCKS` is picked at MODULE LOAD from `TENANT_KEY`, so each
 * case resets the registry and re-imports. It is used in two places that must
 * agree — the public fallback and «انشر الصفحة الافتراضية» in /admin/home —
 * and only the second one is irreversible, which is why the wrong list here
 * would not be a cosmetic bug.
 */
const KEYS = ['TENANT_KEY', 'TENANT_DISPLAY_NAME'] as const;

async function loadWith(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  vi.resetModules();
  return import('./home-blocks');
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
  vi.resetModules();
});

/**
 * The starter page's hero, or a loud failure.
 *
 * `blocks[0].props` does not type-check under `noUncheckedIndexedAccess`, and
 * the obvious fix — wrapping the assertions in `if (hero.type === 'hero')` —
 * is worse than the type error: a starter page that stopped opening with a
 * hero would make both tests pass by skipping their bodies. This narrows and
 * throws, so the same mistake is a red test.
 */
function heroOf(blocks: readonly { key: string; props: { type: string } }[]) {
  const first = blocks[0]?.props;
  if (!first || first.type !== 'hero') {
    throw new Error(`the starter page must open with a hero, got ${first?.type ?? 'nothing'}`);
  }
  return first as { type: 'hero'; headlineAr: string };
}

/** Everything the starter page says, flattened, so a string cannot hide in a nested prop. */
function allText(blocks: readonly { key: string; props: unknown }[]): string {
  return JSON.stringify(blocks);
}

describe('STARTER_HOME_BLOCKS', () => {
  it("is Ayman's full designed page when TENANT_KEY is unset", async () => {
    // His stack sets nothing, and an API blip must still render his homepage —
    // not a stripped one. This is the regression that matters most here.
    const { STARTER_HOME_BLOCKS, DEFAULT_HOME_BLOCKS } = await loadWith({});

    expect(STARTER_HOME_BLOCKS).toEqual(DEFAULT_HOME_BLOCKS);
  });

  it("is Ayman's page for TENANT_KEY=ayman too", async () => {
    const { STARTER_HOME_BLOCKS, DEFAULT_HOME_BLOCKS } = await loadWith({ TENANT_KEY: 'ayman' });

    expect(STARTER_HOME_BLOCKS).toEqual(DEFAULT_HOME_BLOCKS);
  });

  it('is a short neutral page for any other tenant', async () => {
    const { STARTER_HOME_BLOCKS } = await loadWith({ TENANT_KEY: 'x' });

    expect(STARTER_HOME_BLOCKS.map((block) => block.props.type)).toEqual([
      'hero',
      'courseGrid',
      'yearTracks',
    ]);
  });

  it('never names Ayman, or anything that only exists on his site', async () => {
    const { STARTER_HOME_BLOCKS } = await loadWith({ TENANT_KEY: 'x' });
    const text = allText(STARTER_HOME_BLOCKS);

    for (const needle of ['أيمن', 'ayman', 'Ayman', 'أبو العلا', '201021196367']) {
      expect(text, `the neutral starter page must not contain "${needle}"`).not.toContain(needle);
    }
  });

  it('carries no biography and no honour board on a brand new site', async () => {
    // `about` and `instructor` are somebody's CV; `honorBoard` renders reserved
    // empty places, which on a site with no exam results yet reads as broken
    // rather than as a promise. `faq` is ten answers about courses that do not
    // exist here.
    const { STARTER_HOME_BLOCKS } = await loadWith({ TENANT_KEY: 'x' });
    const types = STARTER_HOME_BLOCKS.map((block) => block.props.type);

    for (const forbidden of ['about', 'instructor', 'honorBoard', 'faq', 'whyRail', 'books']) {
      expect(types).not.toContain(forbidden);
    }
  });

  it('uses the tenant display name in the hero when it is given', async () => {
    const { STARTER_HOME_BLOCKS } = await loadWith({
      TENANT_KEY: 'x',
      TENANT_DISPLAY_NAME: 'منصة محمد حسن',
    });
    expect(heroOf(STARTER_HOME_BLOCKS).headlineAr).toBe('منصة محمد حسن');
  });

  it('names nobody rather than the wrong person when the display name is missing', async () => {
    const { STARTER_HOME_BLOCKS } = await loadWith({ TENANT_KEY: 'x' });
    const hero = heroOf(STARTER_HOME_BLOCKS);

    expect(hero.headlineAr).toBe('المنصة التعليمية');
    expect(hero.headlineAr).not.toContain('أيمن');
  });

  it('keeps every neutral block valid against the shared block schema', async () => {
    // The starter list is written by hand, and an invalid block would only
    // surface as a 500 on a brand new tenant's homepage — the one page nobody
    // is watching on day one.
    const { STARTER_HOME_BLOCKS } = await loadWith({ TENANT_KEY: 'x' });
    const { HomeBlockPropsSchema } = await import('@ayman/contracts/admin/home-blocks');

    for (const block of STARTER_HOME_BLOCKS) {
      expect(() => HomeBlockPropsSchema.parse(block.props), block.key).not.toThrow();
    }
  });
});
