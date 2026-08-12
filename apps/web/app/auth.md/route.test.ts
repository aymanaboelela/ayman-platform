import { describe, expect, it } from 'vitest';
import { GET } from './route';

/**
 * The H1 of `/auth.md` is protocol, not prose.
 *
 * The Auth.md convention is detected by "an H1 heading that contains
 * `auth.md`", and that check is a hard gate — a scanner that fails it stops
 * reading and reports the document as missing, which is exactly what happened
 * on 2026-08-12 while the heading said `# Authentication`. The failure is
 * silent from this side: the route returns 200, the body is correct markdown,
 * and every other test passes.
 *
 * So the risk this guards is a tidy-up, not a bug. `# auth.md — Authentication`
 * reads like a filename someone left in a title, and the obvious edit is to
 * remove it.
 */
describe('/auth.md', () => {
  it('leads with an H1 containing the literal string the convention looks for', async () => {
    const body = await GET().text();
    // `?? ''` rather than a `!`: an empty body is a real failure mode worth an
    // assertion rather than a crash, and `noUncheckedIndexedAccess` is right
    // that `[0]` on a split is not guaranteed.
    const h1 = body.split('\n')[0] ?? '';

    expect(h1).toMatch(/^#\s/);
    expect(h1.toLowerCase()).toContain('auth.md');
  });

  it('is served as markdown', async () => {
    // `text/markdown`, not `text/plain`: the scan requests it with
    // `Accept: text/markdown, text/plain, */*` and records the type it got.
    expect(GET().headers.get('Content-Type')).toMatch(/^text\/markdown/);
  });

  it('still says plainly that there is no credential to obtain', async () => {
    const body = await GET().text();

    /*
     * The whole point of the document. If a future change ever makes this
     * assertion fail, it should be because the platform genuinely grew an
     * agent-facing credential — in which case `/.well-known/oauth-protected-resource`
     * and the OAuth metadata become publishable for the first time, and
     * `docs/runbooks/agent-discovery.md` needs rewriting rather than patching.
     */
    expect(body).toContain('there is nothing to obtain');
    expect(body).toContain('Do not attempt to sign in on their behalf');
  });
});
