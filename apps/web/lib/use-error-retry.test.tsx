import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'next/navigation';
import { useErrorRetry } from './use-error-retry';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

const refresh = vi.fn();
const reload = vi.fn();

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ refresh } as unknown as ReturnType<typeof useRouter>);
  // jsdom's `location.reload` is not configurable in place, so the whole
  // accessor is replaced. `vi.unstubAllGlobals` in `afterEach` puts it back.
  vi.stubGlobal('location', { ...window.location, reload });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/**
 * The order of the two calls is the whole fix, so the harness records it
 * rather than asserting on each in isolation — `reset()` before
 * `router.refresh()` is exactly the broken behaviour this file exists to
 * prevent, and two independent `toHaveBeenCalled` assertions pass on it.
 */
function Harness({ digest, message = 'boom' }: { digest?: string; message?: string }) {
  const error = Object.assign(new Error(message), { digest });
  const { retry, retrying } = useErrorRetry(error, () => calls.push('reset'));
  return (
    <button type="button" onClick={retry} disabled={retrying}>
      retry
    </button>
  );
}

let calls: string[] = [];

beforeEach(() => {
  calls = [];
  refresh.mockImplementation(() => calls.push('refresh'));
});

const press = () => fireEvent.click(screen.getByRole('button', { name: 'retry' }));

describe('useErrorRetry', () => {
  it('refreshes the router BEFORE resetting the boundary', () => {
    // The bug: `reset()` alone re-renders against the cached RSC payload and
    // reproduces the same throw, so the press does nothing visible. Only
    // `router.refresh()` invalidates that cache, and it has to happen first —
    // otherwise the reset renders the stale tree before the refresh lands.
    render(<Harness digest="first-failure" />);
    press();

    expect(calls).toEqual(['refresh', 'reset']);
    expect(reload).not.toHaveBeenCalled();
  });

  it('escalates a second press on the SAME failure to a document load', () => {
    // A refresh cannot fix a client module that failed to evaluate — the
    // broken module graph is still in memory. Only a document load replaces it.
    render(<Harness digest="repeated-failure" />);

    press();
    expect(calls).toEqual(['refresh', 'reset']);
    expect(reload).not.toHaveBeenCalled();

    press();
    expect(reload).toHaveBeenCalledTimes(1);
    // The second press must NOT also refresh/reset — it is a different action,
    // not an additional one.
    expect(calls).toEqual(['refresh', 'reset']);
  });

  it('gives a different failure its own first press', () => {
    // The counter is module-scoped so it survives the boundary remounting. That
    // is deliberate, and this is the risk it carries: a later, unrelated error
    // must not inherit a strike and hard-reload on its first press.
    render(<Harness digest="failure-a" />);
    press();
    press();
    expect(reload).toHaveBeenCalledTimes(1);

    cleanup();
    reload.mockClear();
    calls = [];

    render(<Harness digest="failure-b" />);
    press();

    expect(calls).toEqual(['refresh', 'reset']);
    expect(reload).not.toHaveBeenCalled();
  });

  /*
   * The stale-deploy branch, which is the one case where the FIRST press must
   * skip straight to a document load.
   *
   * A tab open across a deploy holds Server Action ids from a build the server
   * no longer has. `router.refresh()` re-fetches the RSC payload and leaves the
   * loaded client bundle — where the stale id lives — so the normal first press
   * is guaranteed to do nothing, and the editor only recovers on the second.
   * Measured on production as `/admin/errors` row 17.
   *
   * These assert the ABSENCE of the refresh as hard as the presence of the
   * reload: a version that reloaded *and* refreshed would look fixed by a
   * `toHaveBeenCalled` check while still doing the useless work first.
   */
  it('reloads on the FIRST press when the tab is older than the deploy', () => {
    render(
      <Harness message={'Server Action "70674c2750" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'} />,
    );
    press();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it('does not let a stale-deploy press spend the strike of a later error', () => {
    // The stale branch returns before the module-scoped counter is touched. If
    // it fell through instead, the next unrelated failure would arrive already
    // holding a strike and hard-reload on its own first press — the exact bug
    // the `failure-a`/`failure-b` case above guards.
    render(
      <Harness message={'Server Action "abc" was not found on the server. '} />,
    );
    press();
    expect(reload).toHaveBeenCalledTimes(1);

    cleanup();
    reload.mockClear();
    calls = [];

    render(<Harness digest="an-ordinary-server-error" />);
    press();

    expect(calls).toEqual(['refresh', 'reset']);
    expect(reload).not.toHaveBeenCalled();
  });

  /**
   * A chunk that is not on the server any more — the failure `public/sw.js`
   * versioning its cache per build makes reachable, and the one nobody can
   * press their way out of.
   *
   * Both halves are asserted because each is a separate promise to the student:
   * the reload happens WITHOUT a press (they are looking at an error screen for
   * a file that a fresh document would have), and it happens ONCE (a genuinely
   * unreachable asset must land on the error screen and stay there rather than
   * reloading forever).
   */
  it('reloads once, with no press, for a chunk the build no longer has', () => {
    window.sessionStorage.clear();
    const message = 'Failed to load chunk /_next/static/chunks/1n-wn64nqsgu1.js from script';

    render(<Harness message={message} />);
    expect(reload).toHaveBeenCalledTimes(1);

    // The same failure arriving again — which is what a reload that did not fix
    // it looks like — must not reload a second time.
    cleanup();
    render(<Harness message={message} />);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not spend a chunk press on a refresh that cannot help', () => {
    // `router.refresh()` re-requests the RSC payload and leaves the loaded
    // bundle alone, so it cannot conjure a file the server does not have.
    // Reached only when the automatic reload above was refused or already
    // spent — `sessionStorage` pre-marked here to put the hook in that state.
    const message = 'Failed to load chunk /_next/static/chunks/0r-9dd_lrviuf.js from script';
    window.sessionStorage.setItem('ayman:module-eval-reload', message);

    render(<Harness message={message} />);
    expect(reload).not.toHaveBeenCalled();

    press();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it('falls back to the message when there is no digest', () => {
    // `digest` is absent for a client-side throw and in development, so the
    // message is the only identity available. Without a fallback both would key
    // on `undefined` and any two client errors would look like a repeat.
    render(<Harness message="client-side-a" />);
    press();
    expect(calls).toEqual(['refresh', 'reset']);

    cleanup();
    calls = [];

    render(<Harness message="client-side-b" />);
    press();

    expect(calls).toEqual(['refresh', 'reset']);
    expect(reload).not.toHaveBeenCalled();
  });
});
