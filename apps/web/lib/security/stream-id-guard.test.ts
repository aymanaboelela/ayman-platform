// @vitest-environment node
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { DOM_MUTATION_GUARD, PREPAINT_SCRIPT, STREAM_ID_GUARD } from './prepaint-script';

/**
 * React streams a resumed render that reuses an id its prerendered shell has
 * already given out, and `STREAM_ID_GUARD` is what keeps that from moving the
 * student shell into a list item. See the guard for the whole story.
 *
 * Everything here is real. The HTML comes from the React build Next 16.2.11
 * ships for `cacheComponents`, prerendered, aborted and resumed the way Next
 * does it. The scripts that run are the ones React streamed. jsdom parses the
 * whole document in one go, which is the worst case in the browser: every
 * streamed instruction runs before the batched reveal (`$RV`) does. In the
 * browser that order depends on how the bytes arrive, and the e2e failure
 * was one such arrival.
 *
 * The tree is the production shape, reduced:
 *
 *   · a boundary around a big completed shell, the root `loading.tsx`
 *     around the student shell. It is big enough (over React's 12,800-byte
 *     chunk size) to be outlined while the shell is written, which is where
 *     the extra id is spent;
 *   · a slot inside it that only the request can fill (a postponed boundary,
 *     like the rail's courses and the account menu);
 *   · a part of the slot that streams late in the resume (a new segment, like
 *     the steps of «نبدأ من هنا»), which takes the next id: the same one.
 */

const require = createRequire(import.meta.url);
// jsdom has no bundled types and the app does not need `@types/jsdom` for one
// test, so the two constructors used here are typed by hand.
const { JSDOM, VirtualConsole } = require('jsdom') as {
  JSDOM: new (
    html: string,
    options: { runScripts: 'dangerously'; pretendToBeVisual: boolean; virtualConsole: unknown },
  ) => { window: Window & typeof globalThis };
  VirtualConsole: new () => { on(event: 'jsdomError', listener: (error: Error) => void): void };
};
const React = require('next/dist/compiled/react-experimental') as typeof import('react');
const { prerenderToNodeStream } = require('next/dist/compiled/react-dom-experimental/static.node.js') as {
  prerenderToNodeStream: (
    node: React.ReactNode,
    options: { signal: AbortSignal; onError?: () => void },
  ) => Promise<{ prelude: AsyncIterable<Uint8Array>; postponed: unknown }>;
};
const { resumeToPipeableStream } = require('next/dist/compiled/react-dom-experimental/server.node.js') as {
  resumeToPipeableStream: (
    node: React.ReactNode,
    postponed: unknown,
    options: { onShellReady?: () => void; onAllReady?: () => void; onError?: (error: unknown) => void },
  ) => { pipe: (destination: Writable) => void };
};

const h = React.createElement;

/** Prerenders, aborts like Next does, resumes, and returns one HTML document. */
async function streamPage({ shellBytes }: { shellBytes: number }): Promise<string> {
  let phase: 'prerender' | 'resume' = 'prerender';
  const never = new Promise<never>(() => {});
  let releaseLate: () => void = () => {};
  const late = new Promise<void>((resolve) => (releaseLate = resolve));

  function Late() {
    React.use(late);
    return h('span', null, 'late');
  }
  function Slot() {
    if (phase === 'prerender') React.use(never);
    return h('b', null, 'slot content ', h(Late));
  }
  function Page() {
    return h(
      'html',
      null,
      h('head', null),
      h(
        'body',
        null,
        h(
          React.Suspense,
          { fallback: h('p', null, 'root loading') },
          h(
            'div',
            { className: 'shell' },
            h('nav', null, 'x'.repeat(shellBytes)),
            h(React.Suspense, { fallback: h('i', null, 'slot fallback') }, h(Slot)),
          ),
        ),
      ),
    );
  }

  const controller = new AbortController();
  const prerendered = prerenderToNodeStream(h(Page), { signal: controller.signal, onError() {} });
  setTimeout(() => controller.abort(), 20);
  const { prelude, postponed } = await prerendered;
  let shell = '';
  for await (const chunk of prelude) shell += Buffer.from(chunk).toString('utf8');

  phase = 'resume';
  let resumed = '';
  const sink = new Writable({
    write(chunk, _encoding, done) {
      resumed += Buffer.from(chunk).toString('utf8');
      done();
    },
  });
  await new Promise<void>((resolve, reject) => {
    const stream = resumeToPipeableStream(h(Page), postponed, {
      onShellReady() {
        stream.pipe(sink);
        setTimeout(releaseLate, 20);
      },
      onAllReady() {
        setTimeout(resolve, 20);
      },
      onError: reject,
    });
  });
  // What Next sends: the shell without its closing tags, then the resume.
  return shell.replace('</body></html>', '') + resumed;
}

function duplicateIds(html: string): string[] {
  const seen = new Map<string, number>();
  for (const [, id] of html.matchAll(/ id="([BPS]:[0-9a-f]+)"/g)) seen.set(id!, (seen.get(id!) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
}

/** Loads the document with React's scripts running, and waits out the reveals. */
async function load(html: string, { guard }: { guard: boolean }) {
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  const source = guard ? html.replace('<head>', `<head><script>${STREAM_ID_GUARD}</script>`) : html;
  const dom = new JSDOM(source, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  await new Promise((resolve) => dom.window.setTimeout(resolve, 700));
  const document = dom.window.document;
  const shells = [...document.querySelectorAll('.shell')];
  const result = {
    errors,
    shells: shells.length,
    shellOnPage: shells.length === 1 && shells[0]!.parentElement === document.body,
    slot: document.querySelector('.shell b')?.textContent ?? null,
    fallbacks: [...document.querySelectorAll('p, i')].map((node) => node.textContent),
    leftoverSegments: document.querySelectorAll('div[hidden][id^="S:"]').length,
  };
  dom.window.close();
  return result;
}

describe('STREAM_ID_GUARD', () => {
  it('starts from a stream that really reuses an id — the React bug it works around', async () => {
    const html = await streamPage({ shellBytes: 20_000 });

    // If this fails, React stopped reusing the id: check the React that
    // production runs, and the guard can go once it has the fix too.
    expect(duplicateIds(html)).toEqual(['S:1']);
  });

  it('without the guard, the late segment takes the shell with it — the e2e failure', async () => {
    const page = await load(await streamPage({ shellBytes: 20_000 }), { guard: false });

    expect(page.shellOnPage).toBe(false);
    // Chrome words it «The new child element contains the parent», jsdom «The
    // operation would yield an incorrect node tree». Same error, from `$RV`.
    expect(page.errors.join('\n')).toContain('HierarchyRequestError');
  });

  it('with the guard, every segment lands where React meant it', async () => {
    const page = await load(await streamPage({ shellBytes: 20_000 }), { guard: true });

    expect(page.errors).toEqual([]);
    expect(page.shells).toBe(1);
    expect(page.shellOnPage).toBe(true);
    expect(page.slot).toBe('slot content late');
    expect(page.fallbacks).toEqual([]);
    expect(page.leftoverSegments).toBe(0);
  });

  it('changes nothing when no id is shared', async () => {
    // A shell small enough not to be outlined: no extra id, no duplicate.
    const html = await streamPage({ shellBytes: 100 });
    expect(duplicateIds(html)).toEqual([]);

    const bare = await load(html, { guard: false });
    const guarded = await load(html, { guard: true });

    expect(guarded).toEqual(bare);
    expect(guarded.shellOnPage).toBe(true);
    expect(guarded.slot).toBe('slot content late');
  });

  it('is installed before any of React’s streamed scripts can run', () => {
    // The prepaint script is the first script in <head>; the guard rides in it,
    // after the DOM guard.
    expect(PREPAINT_SCRIPT).toContain(STREAM_ID_GUARD);
    expect(PREPAINT_SCRIPT.indexOf(STREAM_ID_GUARD)).toBeGreaterThan(PREPAINT_SCRIPT.indexOf(DOM_MUTATION_GUARD));
  });
});
