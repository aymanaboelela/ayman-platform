import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CHUNK_SCRIPT_RESCUE, PREPAINT_SCRIPT } from './prepaint-script';

/**
 * `CHUNK_SCRIPT_RESCUE` exists because Turbopack's loader treats "a `<script>`
 * with this src is in the document" as "this chunk is loading" — and a script
 * that already FAILED is still in the document. See the constant.
 *
 * Run for real against jsdom rather than asserted on as a string: the whole
 * question is what happens to an element when its `error` event fires, and a
 * substring check would pass on a listener that never matches anything.
 */
describe('CHUNK_SCRIPT_RESCUE', () => {
  beforeAll(() => {
    // Installed once, exactly as the inline <script> in <head> would be.
    window.eval(CHUNK_SCRIPT_RESCUE);
  });

  afterEach(() => {
    document.head.replaceChildren();
  });

  function script(src: string): HTMLScriptElement {
    const el = document.createElement('script');
    // Assigned as an attribute, not `.src`, so jsdom does not try to fetch it.
    el.setAttribute('src', src);
    document.head.appendChild(el);
    return el;
  }

  it('takes a failed chunk script out of the document', () => {
    const dead = script('/_next/static/chunks/2femmq3pfbmwu.js');
    dead.dispatchEvent(new Event('error'));

    // The loader's `querySelectorAll('script[src="…"]')` now finds nothing,
    // so it creates a fresh element and genuinely downloads the chunk again.
    expect(document.querySelectorAll('script[src="/_next/static/chunks/2femmq3pfbmwu.js"]')).toHaveLength(0);
  });

  it('still lets a listener on the element hear the failure', () => {
    // When the loader got there first it is waiting on THIS element's
    // `error`; removing the node from a capture listener must not swallow it,
    // or a proper ChunkLoadError would turn back into a silent wait.
    const dead = script('/_next/static/chunks/abc.js');
    let heard = false;
    dead.addEventListener('error', () => {
      heard = true;
    });
    dead.dispatchEvent(new Event('error'));

    expect(heard).toBe(true);
    expect(dead.isConnected).toBe(false);
  });

  it('leaves a script that loaded alone', () => {
    const fine = script('/_next/static/chunks/fine.js');
    fine.dispatchEvent(new Event('load'));
    expect(fine.isConnected).toBe(true);
  });

  it('never touches anything that is not our own static chunk', () => {
    // A blocked analytics tag or the YouTube API loader failing is someone
    // else's script; whatever handles it expects to find it where it was.
    const thirdParty = script('https://www.youtube.com/iframe_api');
    const ownButNotStatic = script('/js-runner.js');
    thirdParty.dispatchEvent(new Event('error'));
    ownButNotStatic.dispatchEvent(new Event('error'));

    expect(thirdParty.isConnected).toBe(true);
    expect(ownButNotStatic.isConnected).toBe(true);
  });

  it('ships inside the one inline script the layout renders', () => {
    // It only works if it is listening before the first chunk can fail, and
    // the prepaint script is the one thing in <head> that runs that early.
    expect(PREPAINT_SCRIPT).toContain(CHUNK_SCRIPT_RESCUE);
    // …after the theme half, which has its own `try`: a `localStorage` that
    // throws there must not be able to stop this one installing.
    expect(PREPAINT_SCRIPT.indexOf(CHUNK_SCRIPT_RESCUE)).toBeGreaterThan(0);
  });
});
