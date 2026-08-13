import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATHNAME_HEADER } from '@/lib/request-pathname';
import { ChromeUnlessAttempt } from './chrome-unless-attempt';
import { RailCourses } from './rail-courses';

/*
 * `vi.hoisted` because `vi.mock` factories run before this module's own body:
 * the mocks need a box to read out of, and the box has to exist first.
 *
 * `getDashboard` is mocked at the module the rail imports it from, not at
 * `fetch`, so the assertion is about the READ — "did anything ask the API for
 * the dashboard" — rather than about how the read is transported.
 */
const mocks = vi.hoisted(() => ({
  requestHeaders: new Headers(),
  getDashboard: vi.fn(async () => ({ enrolledCourses: [] as unknown[] })),
}));

vi.mock('next/headers', () => ({
  headers: async () => mocks.requestHeaders,
}));

vi.mock('@/lib/dashboard', () => ({
  getDashboard: mocks.getDashboard,
}));

/**
 * Renders a server tree the way the RSC pass does: call each function
 * component, await it, walk what it returned.
 *
 * A shallow "did it return null" check would not prove the thing under test.
 * The bug this guards is that merely CONSTRUCTING `<RailCourses />` and handing
 * it to a client component that discards it still costs a round trip, because
 * the server renders the element before the client ever sees it. So the test
 * has to render, and this is the smallest renderer that observes it — React's
 * own SSR renderers do not run async Server Components outside a real RSC
 * environment.
 */
async function renderServerTree(node: ReactNode): Promise<void> {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;

    if (typeof child.type === 'function') {
      const render = child.type as (props: unknown) => ReactNode | Promise<ReactNode>;
      await renderServerTree(await render(child.props));
      continue;
    }

    // A host element, a Fragment or a <Suspense>: nothing to call, but its
    // children are still part of the same server render.
    await renderServerTree(child.props.children);
  }
}

const on = (pathname: string | null) => {
  mocks.requestHeaders = new Headers(pathname === null ? {} : { [PATHNAME_HEADER]: pathname });
};

beforeEach(() => {
  mocks.getDashboard.mockClear();
  on(null);
});

describe('ChromeUnlessAttempt', () => {
  it('never lets a running attempt reach the dashboard read', async () => {
    /*
     * The whole point of the file. `/api/me/dashboard` is the heaviest endpoint
     * in the app, and on this route the rail it feeds is discarded by
     * `student-shell.tsx` before a single pixel of it is drawn — so the request
     * is spent, out of a rate-limit budget, while the runner is asking for the
     * questions of a timed exam.
     */
    on('/quizzes/lesson-1/attempt/attempt-1');

    await renderServerTree(
      <ChromeUnlessAttempt>
        <RailCourses />
      </ChromeUnlessAttempt>,
    );

    expect(mocks.getDashboard).not.toHaveBeenCalled();
  });

  it('keeps the read on the REVIEW screen under that same attempt', async () => {
    // Not an attempt: read-only, already graded, full chrome. If this ever goes
    // quiet, the anchored `$` in `isAttemptRoute` has been loosened.
    on('/quizzes/lesson-1/attempt/attempt-1/review');

    await renderServerTree(
      <ChromeUnlessAttempt>
        <RailCourses />
      </ChromeUnlessAttempt>,
    );

    expect(mocks.getDashboard).toHaveBeenCalledTimes(1);
  });

  it('keeps the read on an ordinary signed-in route', async () => {
    on('/dashboard');

    await renderServerTree(
      <ChromeUnlessAttempt>
        <RailCourses />
      </ChromeUnlessAttempt>,
    );

    expect(mocks.getDashboard).toHaveBeenCalledTimes(1);
  });

  it('fails OPEN when the proxy stamped nothing', async () => {
    // A prefetch, or one of the `(app)` routes the proxy's public branch leaves
    // alone. None of them is the runner, and a missing header must never be
    // read as "hide the chrome" — that would blank the rail on a whole class of
    // requests to save nothing.
    on(null);

    await renderServerTree(
      <ChromeUnlessAttempt>
        <RailCourses />
      </ChromeUnlessAttempt>,
    );

    expect(mocks.getDashboard).toHaveBeenCalledTimes(1);
  });
});

describe('(app)/layout.tsx wiring', () => {
  const source = readFileSync(
    join(import.meta.dirname, '..', '..', 'app', '(app)', 'layout.tsx'),
    'utf8',
  );

  it.each(['RailCourses', 'NotificationBell', 'AccountMenu'])(
    'guards the %s slot',
    (chrome: string) => {
      // Read from the source rather than by rendering the layout: the layout
      // mounts client components (`StudentShell`, the assistant widget) that a
      // server-tree walk cannot call. What matters is the wiring, and an
      // unguarded slot is exactly what a regression looks like — the fetch
      // comes back and nothing anywhere fails.
      expect(source).toMatch(new RegExp(`<ChromeUnlessAttempt>\\s*<${chrome} />`));
    },
  );

  it('leaves the layout itself synchronous and request-blind', () => {
    /*
     * Both halves of the rule this change had to work around.
     *
     * `async` — an awaiting layout blocks every client-side transition into the
     * group on a round trip with the previous page still mounted; that is what
     * the layout's own comment is about and it cost an e2e failure once.
     *
     * `headers()` — under `cacheComponents: true` it returns a hanging promise
     * during a prerender, so a read at the top of this file blocks the root of
     * every route in the group: no static shell, and a build that fails on all
     * of them. The read belongs inside the `<Suspense>` boundaries, which is
     * where `<ChromeUnlessAttempt>` does it.
     */
    expect(source).not.toMatch(/export default async function/);
    expect(source.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\bheaders\s*\(/);
  });
});
