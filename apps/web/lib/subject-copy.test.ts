import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { subjectCopy } from '@ayman/contracts/copy/subject';

/**
 * The subject gate, asserted on BOTH halves of its contract.
 *
 * Every stack that teaches programming — Ayman's, and the first two
 * instructors', which set no `TENANT_SUBJECT` at all — must get back the very
 * strings they had before the gate existed: `toBe`, not `toEqual`, because a
 * rebuilt string that happens to match would be a promise kept by accident.
 * Every other stack must get its own subject and nothing about code.
 *
 * Both modules decide at MODULE LOAD, so each case resets the registry and
 * re-imports — the shape `tenant-copy.test.ts` uses.
 */
const KEYS = ['TENANT_KEY', 'TENANT_DISPLAY_NAME', 'TENANT_SUBJECT'] as const;
type Env = Partial<Record<(typeof KEYS)[number], string>>;

async function loadWith(env: Env) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  vi.resetModules();
  const [subject, gate] = await Promise.all([import('./tenant-subject'), import('./subject-copy')]);
  return { ...subject, ...gate };
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

/** The three live stacks, configured the way they are today. */
const AYMAN: Env = {};
const SABRY: Env = { TENANT_KEY: 'mohamed-sabry', TENANT_DISPLAY_NAME: 'منصة محمد صبري' };
/** A stack that teaches something else. */
const PHYSICS: Env = {
  TENANT_KEY: 'demo',
  TENANT_DISPLAY_NAME: 'م. محمد حسن',
  TENANT_SUBJECT: 'physics',
};

describe('a stack that teaches programming', () => {
  it.each([
    ['Ayman', AYMAN],
    ['Sabry (no TENANT_SUBJECT)', SABRY],
    ['Sabry, programming spelled out', { ...SABRY, TENANT_SUBJECT: 'programming_cs' }],
    // His stack is programming by definition — a stray variable cannot retitle it.
    ['Ayman with a stray subject', { TENANT_SUBJECT: 'physics' }],
  ])('%s gets the original strings back, the same objects', async (_name, env) => {
    const gate = await loadWith(env);
    expect(gate.TEACHES_CODE).toBe(true);
    expect(gate.bySubject(copy.site.tagline, subjectCopy.site.tagline)).toBe(copy.site.tagline);
    expect(gate.bySubject(copy.landing.footerTagline, subjectCopy.landing.footerTagline)).toBe(
      copy.landing.footerTagline,
    );
    expect(gate.SITE_TAGLINE).toBe(copy.site.tagline);
    expect(gate.STACK_MONOGRAM).toBe('</>');
    const queries = ['a', 'b'];
    expect(gate.bySubjectList(queries, subjectCopy.queries.catalog)).toBe(queries);
  });

  it('keeps the programming routes', async () => {
    const gate = await loadWith(SABRY);
    expect(gate.TEACHES_CODE).toBe(true);
    // The predicate is the proxy's question, asked on every stack; it is
    // `TEACHES_CODE` that keeps a programming stack's routes open.
    expect(gate.isProgrammingOnlyRoute('/playground')).toBe(true);
  });
});

describe('a stack that teaches physics', () => {
  it('names physics, and nothing about code, in the tagline', async () => {
    const gate = await loadWith(PHYSICS);
    expect(gate.TEACHES_CODE).toBe(false);
    expect(gate.SUBJECT_NAME_AR).toBe('الفيزياء');
    expect(gate.SITE_TAGLINE).toBe('الفيزياء — المرحلة الثانوية');
    expect(gate.SITE_TAGLINE).not.toMatch(/برمج|الحاسب/);
  });

  it('fills the extra holes a twin carries', async () => {
    const gate = await loadWith(PHYSICS);
    expect(
      gate.bySubject(copy.landing.aboutPageRoleTitle, subjectCopy.landing.aboutPageRoleTitle, {
        name: 'محمد حسن',
      }),
    ).toBe('محمد حسن — الفيزياء للمرحلة الثانوية');
  });

  it('marks the brand with the stack’s own initial, not a code bracket', async () => {
    const gate = await loadWith(PHYSICS);
    expect(gate.STACK_MONOGRAM).toBe('م');
  });

  it('closes the playground, the shell glossary and its public twin', async () => {
    const gate = await loadWith(PHYSICS);
    for (const path of ['/playground', '/foundations', '/essentials', '/playground/anything']) {
      expect(gate.isProgrammingOnlyRoute(path), path).toBe(true);
    }
    for (const path of ['/', '/courses', '/essentials.md', '/years/2', '/playgrounds']) {
      expect(gate.isProgrammingOnlyRoute(path), path).toBe(false);
    }
  });
});

describe('a stack whose subject was mistyped', () => {
  it('is not programming, and is not named as programming either', async () => {
    // The preflight refuses the slug; this is the stack that skipped it. It
    // must not keep the Python playground, and it must not title itself
    // «البرمجة وعلوم الحاسب» while every programming tool on it is gone.
    const gate = await loadWith({ TENANT_KEY: 'demo', TENANT_SUBJECT: 'fizyaa' });
    expect(gate.TEACHES_CODE).toBe(false);
    expect(gate.SUBJECT_NAME_AR).toBe(subjectCopy.unknownSubject);
    expect(gate.SITE_TAGLINE).not.toMatch(/برمج/);
  });
});
