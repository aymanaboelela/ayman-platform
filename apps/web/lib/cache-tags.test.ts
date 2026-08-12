import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_TAGS_PER_CALL,
  MAX_TAG_LENGTH,
  TAG_COURSES,
  assertTagBudget,
  courseTag,
  tag,
  tags,
} from './cache-tags';

describe('tag', () => {
  it('joins parts with a colon', () => {
    expect(tag('course')).toBe('course');
    expect(tag('course', '0192f000-0000-7000-8000-000000000001')).toBe(
      'course:0192f000-0000-7000-8000-000000000001',
    );
  });

  it('throws rather than returning a tag over 256 characters', () => {
    const huge = 'x'.repeat(257);
    expect(() => tag(huge)).toThrow(/256/);
  });

  it('accepts exactly 256 characters', () => {
    const exact = 'x'.repeat(256);
    expect(tag(exact)).toHaveLength(256);
  });
});

describe('assertTagBudget', () => {
  it('does not throw at or under 128 tags', () => {
    expect(() => assertTagBudget(Array.from({ length: MAX_TAGS_PER_CALL }, () => 'x'))).not.toThrow();
  });

  it('throws at 129 tags', () => {
    expect(() => assertTagBudget(Array.from({ length: 129 }, () => 'x'))).toThrow(/128/);
  });
});

describe('the vocabulary', () => {
  it('TAG_COURSES is the coarse list tag', () => {
    expect(TAG_COURSES).toBe('course');
  });

  it('courseTag is per-entity', () => {
    expect(courseTag('abc')).toBe('course:abc');
    expect(courseTag('abc')).not.toBe(courseTag('def'));
  });
});

describe('tag part validation', () => {
  it('rejects an empty part, which would produce a double colon', () => {
    expect(() => tag('settings', '')).toThrow();
  });
});

describe('tags', () => {
  it('produces the documented shapes', () => {
    expect(tags.settings('branding')).toBe('settings:branding');
    expect(tags.flags()).toBe('flags');
    expect(tags.nav()).toBe('nav');
    expect(tags.homeBlocks()).toBe('home-blocks');
    expect(tags.media('0191f2a0-1111-7000-8000-000000000000')).toBe(
      'media:0191f2a0-1111-7000-8000-000000000000',
    );
    expect(tags.taxonomy()).toBe('taxonomy');
  });

  it('every tag it can build is inside the 256-character budget', () => {
    const built = [
      tags.settings('branding'),
      tags.settings('seo'),
      tags.settings('contact'),
      tags.settings('features'),
      tags.flags(),
      tags.nav(),
      tags.homeBlocks(),
      tags.taxonomy(),
      tags.media('0191f2a0-1111-7000-8000-000000000000'),
    ];
    for (const value of built) {
      expect(value.length).toBeLessThanOrEqual(MAX_TAG_LENGTH);
    }
    expect(() => assertTagBudget(built)).not.toThrow();
  });
});

/**
 * A tag with no `cacheTag()` claiming it is a dead `updateTag()` — and dead in
 * the silent way this module's header opens by warning about: no error, no
 * warning, the admin's write simply never reaches the reader and the page
 * serves the old value until its `cacheLife` runs out on its own.
 *
 * `tags.taxonomy()` was exactly that for months. `admin/taxonomy/actions.ts`
 * called `updateTag(tags.taxonomy())` after every write; `lib/taxonomy.ts` had
 * `cacheLife('minutes')` and no `cacheTag`. Nothing was wrong at either end,
 * and the invalidation still did nothing. Nobody noticed because the only
 * consumer at the time was a chip beside the dashboard greeting.
 *
 * So this reads the SOURCE rather than the runtime: the two halves live in
 * different files that are never imported together, so there is no object a
 * unit test could inspect to find the gap. Anything worth catching here is a
 * missing line, and a missing line is only visible in the text.
 */
const LIB_DIR = import.meta.dirname;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The argument text of every `cacheTag(...)` call in a file.
 *
 * Paren-balanced rather than a `/cacheTag\(([^)]*)\)/` regex, because every
 * real call in this codebase passes a CALL — `cacheTag(tags.settings('seo'),
 * tags.settings('contact'))` — so a non-greedy match to the first `)` would
 * capture `tags.settings('seo'` and miss the second tag entirely.
 */
function cacheTagArguments(source: string): string[] {
  const out: string[] = [];
  const call = /\bcacheTag\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = call.exec(source)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }
    out.push(source.slice(start, i - 1));
  }
  return out;
}

/**
 * Tags whose loader has not been written yet, each with the reason.
 *
 * This list is asserted in BOTH directions on purpose. Adding a tag with no
 * loader fails until it is listed here with an explanation; landing the loader
 * fails until the entry is removed. The second half is the one that keeps this
 * comment true a year from now — an exemption list nobody is forced to prune
 * is just a list of things that used to be broken.
 */
const PENDING: Record<string, string> = {
  // `lib/settings.ts`'s header states it: `getNavigation` and `getFlags` land
  // with the `admin/navigation` and `admin/flags` contracts. The admin actions
  // that invalidate them (`admin/navigation/actions.ts:23`,
  // `admin/flags/actions.ts:23`) already exist and are inert until then.
  nav: 'getNavigation() not written yet — see lib/settings.ts',
  flags: 'getFlags() not written yet — see lib/settings.ts',
  // `admin/media/actions.ts:33` says so at the call site: `tags.media(id)`
  // exists for the settings/home-block loaders that will reference an uploaded
  // asset by id. Nothing reads a single media record through a cache yet.
  media: 'no per-media loader yet — see app/(admin)/admin/media/actions.ts',
};

describe('every tag in the vocabulary has a loader claiming it', () => {
  const claims = sourceFiles(LIB_DIR)
    .flatMap((file) => cacheTagArguments(readFileSync(file, 'utf8')))
    .join('\n');

  const unclaimed = Object.keys(tags).filter((key) => !claims.includes(`tags.${key}(`));

  it('leaves no tag that only ever gets invalidated', () => {
    const missing = unclaimed.filter((key) => !(key in PENDING));
    expect(
      missing,
      `tags.${missing.join('/')} is invalidated somewhere but no cacheTag() under lib/ carries it — ` +
        'the updateTag call is dead and the page will serve stale until its cacheLife expires. ' +
        'Add the cacheTag to the loader, or add the key to PENDING with the reason.',
    ).toEqual([]);
  });

  it('keeps the PENDING list honest', () => {
    const landed = Object.keys(PENDING).filter((key) => !unclaimed.includes(key));
    expect(
      landed,
      `tags.${landed.join('/')} now has a loader — delete the PENDING entry (and its comment).`,
    ).toEqual([]);
  });

  it('claims the taxonomy tag, which the onboarding and section selects depend on', () => {
    // Named explicitly rather than left to the sweep above: this is the one
    // that was actually broken, and `/onboarding` renders its governorate and
    // year SELECTS from it — an admin adding a governorate expects the next
    // student to be able to pick it.
    expect(claims).toContain('tags.taxonomy()');
  });
});
