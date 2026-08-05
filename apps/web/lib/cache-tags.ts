/**
 * ONE definition of every cache tag, imported by both the `'use cache'`
 * loaders and the server actions that invalidate them. A tag written as a
 * string literal in two files is a tag that will diverge, and a mismatched
 * tag fails SILENTLY — the page just serves stale forever with no error
 * anywhere.
 *
 * ⚠️ `cacheTag` skips any tag over 256 characters with only a console
 * warning, and accepts at most 128 tags per call. `course:<uuid>` is 43
 * characters, and the catalog LIST deliberately carries the single coarse
 * tag rather than one tag per course — 200 published courses would silently
 * blow the 128 limit.
 *
 * `tag()` is the ONLY sanctioned way to build a tag anywhere in `apps/web`.
 * It throws on an over-long tag rather than letting Next skip it, which
 * turns a silent cache-invalidation hole into a build-time failure. Plan 6
 * Task 4 extends THIS file with `tags.settings/nav/flags/home`; it does not
 * create a second builder.
 */
export const MAX_TAG_LENGTH = 256;
export const MAX_TAGS_PER_CALL = 128;

export function tag(...parts: readonly string[]): string {
  for (const part of parts) {
    // An empty part produces a double colon, which reads as a different tag to
    // Next and as the same tag to a human — the worst kind of mismatch.
    if (part.length === 0) {
      throw new Error('cache tag parts must be non-empty');
    }
  }

  const value = parts.join(':');
  if (value.length > MAX_TAG_LENGTH) {
    throw new Error(
      `cache tag exceeds ${MAX_TAG_LENGTH} characters and would be silently skipped: ${value.slice(0, 64)}…`,
    );
  }
  return value;
}

export function assertTagBudget(values: readonly string[]): void {
  if (values.length > MAX_TAGS_PER_CALL) {
    throw new Error(`cacheTag accepts at most ${MAX_TAGS_PER_CALL} tags per call, got ${values.length}`);
  }
}

export const TAG_COURSES = tag('course');

/** Per-entity tag, so editing one course does not invalidate the other 40. */
export const courseTag = (courseId: string): string => tag('course', courseId);

/**
 * «نيوز» — the public articles section.
 *
 * ONE coarse tag, no per-post tag, for the same reason the catalog list has
 * one: publishing an article changes the index AND that article's page, and
 * the section will never approach the 128-tag ceiling. A per-post tag would
 * buy nothing and add a second place to get the string wrong.
 */
export const TAG_NEWS = tag('news');

/**
 * The settings sections a public loader may be tagged with. Kept as a union
 * rather than a bare `string` so `tags.settings('brading')` is a compile error
 * rather than a cache entry nothing ever invalidates.
 */
export type SettingsKey = 'branding' | 'seo' | 'contact' | 'features';

/**
 * Plan 6's tag vocabulary, layered on `tag()` above. One object, imported by
 * both the `'use cache'` loaders and the server actions that call
 * `updateTag()` — a tag written as a literal in two files is a tag that will
 * diverge, and the divergence is silent.
 */
export const tags = {
  settings: (key: SettingsKey): string => tag('settings', key),
  flags: (): string => tag('flags'),
  nav: (): string => tag('nav'),
  homeBlocks: (): string => tag('home-blocks'),
  media: (id: string): string => tag('media', id),
  taxonomy: (): string => tag('taxonomy'),
} as const;
