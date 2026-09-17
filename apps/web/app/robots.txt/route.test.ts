import { describe, expect, it } from 'vitest';
import { GET } from './route';

/**
 * Parse the file the way a crawler does: into groups keyed by user-agent.
 *
 * A robots.txt group is "one or more `User-agent` lines followed by the rules
 * that apply to them", and a named group REPLACES the wildcard group for that
 * agent rather than adding to it. Both facts are the reason these tests exist —
 * they are the two things about this file that are invisible when you read it
 * and catastrophic when they are wrong.
 */
function parseGroups(body: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let current: string[] | null = null;

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    const agent = /^User-agent:\s*(.+)$/i.exec(line);
    if (agent?.[1]) {
      current = [];
      groups.set(agent[1].trim(), current);
      continue;
    }
    current?.push(line);
  }

  return groups;
}

describe('/robots.txt', () => {
  it('gives every named retrieval crawler the same disallow list as the wildcard group', async () => {
    /*
     * ⚠️ The failure this guards is total and silent.
     *
     * A named `User-agent` group replaces the `*` group for that crawler; it
     * does not inherit from it. So the moment `User-agent: OAI-SearchBot` was
     * added, every `Disallow:` line in the wildcard group stopped applying to
     * it — and the fix (repeating them under each agent) is exactly the kind of
     * repetition a later tidy-up removes. Removing it would hand ChatGPT's
     * crawler `/admin`, `/dashboard` and the whole signed-in surface, with a
     * robots.txt that still looks correct at a glance and no test failing
     * anywhere else.
     */
    const groups = parseGroups(await GET().text());
    const wildcard = groups.get('*');
    expect(wildcard).toBeDefined();

    const wildcardDisallows = wildcard?.filter((rule) => rule.startsWith('Disallow:')) ?? [];
    expect(wildcardDisallows.length).toBeGreaterThan(5);

    for (const [agent, rules] of groups) {
      if (agent === '*') continue;
      // The training crawlers are a blanket `Disallow: /`, which already covers
      // everything the wildcard list names.
      if (rules.includes('Disallow: /')) continue;

      for (const disallow of wildcardDisallows) {
        expect(rules, `${agent} is missing ${disallow}`).toContain(disallow);
      }
    }
  });

  it('never names one crawler in both the retrieval and the training group', async () => {
    // Matching is case-insensitive, so two entries differing only in case are
    // one agent with two contradictory groups — and which one wins is up to the
    // crawler.
    const agents = [...parseGroups(await GET().text()).keys()].map((a) => a.toLowerCase());
    expect(new Set(agents).size).toBe(agents.length);
  });

  it('keeps the training crawlers blocked and the answer crawlers allowed', async () => {
    /*
     * The instructor's decision, as the only line a crawler actually obeys.
     * `ai-train=no` in `Content-Signal` is a preference; these are the rules.
     *
     * ⚠️ `GPTBot` and `ChatGPT-User` are different products — training vs. the
     * fetch ChatGPT makes to answer a question right now — and so are
     * `ClaudeBot` and `Claude-User`. If this test ever fails because someone
     * "unified" them, the platform has just either leaked its course material
     * into a training set or removed itself from the assistants that recommend
     * it. Read the block comments in the route before changing either list.
     */
    const groups = parseGroups(await GET().text());

    for (const trainer of ['GPTBot', 'ClaudeBot', 'CCBot', 'Bytespider']) {
      expect(groups.get(trainer), `${trainer} has no group`).toContain('Disallow: /');
    }

    for (const reader of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot']) {
      expect(groups.get(reader), `${reader} has no group`).toContain('Allow: /');
      expect(groups.get(reader)).not.toContain('Disallow: /');
    }
  });

  /**
   * ⚠️ `Google-Extended` is the ONE exception, and it is Ayman's decision of
   * 2026-09-16 rather than a drift. Google gates Gemini grounding and Gemini
   * training behind one token and offers no way to split them; he chose being
   * citable inside Gemini over withholding the training.
   *
   * This asserts the pair together on purpose. `Allow: /` beside a
   * `Content-Signal` still saying `ai-train=no` would hand Google a permission
   * and a refusal of it in the same group — and that contradiction is what a
   * half-applied revert would produce.
   */
  it('grants Google-Extended both the access and the training it gates', async () => {
    const groups = parseGroups(await GET().text());
    const google = groups.get('Google-Extended');

    expect(google, 'Google-Extended has no group').toContain('Allow: /');
    expect(google).not.toContain('Disallow: /');
    expect(google).toContain('Content-Signal: search=yes, ai-input=yes, ai-train=yes');
  });

  /** The site-wide preference is untouched: the exception is named, not general. */
  it('still refuses training in the wildcard group', async () => {
    const groups = parseGroups(await GET().text());

    expect(groups.get('*')).toContain('Content-Signal: search=yes, ai-input=yes, ai-train=no');
  });

  it('still carries the content signal and the sitemap', async () => {
    const body = await GET().text();
    expect(body).toContain('Content-Signal: search=yes, ai-input=yes, ai-train=no');
    expect(body).toMatch(/^Sitemap: https?:\/\/.+\/sitemap\.xml$/m);
  });
});
