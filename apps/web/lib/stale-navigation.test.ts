import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRouterTransitionStart } from '../instrumentation-client';
import { documentLoadFor, isExamRunnerPath, navigationWasHeld } from './stale-navigation';

/**
 * «Once stale, the next page is a document load.» What has to hold: it fires
 * for a real move to another page, in the history mode that keeps back
 * working, and for nothing that is not one — a hash jump, a filter, a back
 * press that only closes an overlay, the exam runner's own back guard.
 */

const at = (href: string) => {
  const url = new URL(href);
  return { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search };
};

describe('documentLoadFor', () => {
  const here = at('https://example.test/dashboard');

  it('does nothing while the tab is current', () => {
    expect(documentLoadFor('/results', 'push', here, '/dashboard', false)).toBeNull();
  });

  it('turns a push to another page into a document load that keeps back working', () => {
    expect(documentLoadFor('/results', 'push', here, '/dashboard', true)).toEqual({
      href: 'https://example.test/results',
      mode: 'assign',
    });
  });

  it('replaces for a router.replace, so back does not land on the same page twice', () => {
    expect(documentLoadFor('/results', 'replace', here, '/dashboard', true)?.mode).toBe('replace');
  });

  it('leaves an in-page move alone: a hash jump, or a filter that only rewrote the query', () => {
    expect(documentLoadFor('/dashboard#streak', 'push', here, '/dashboard', true)).toBeNull();
    expect(documentLoadFor('/dashboard?tab=2', 'replace', here, '/dashboard', true)).toBeNull();
  });

  it('never touches another origin', () => {
    expect(documentLoadFor('https://youtube.com/watch?v=x', 'push', here, '/dashboard', true)).toBeNull();
  });

  it('loads the page back/forward arrived on — judged against where the router was', () => {
    // A traverse reports AFTER the URL moved, so `current` is already the
    // target; the previous pathname is what says it was a move at all.
    const arrived = at('https://example.test/library');
    expect(documentLoadFor(arrived.href, 'traverse', arrived, '/dashboard', true)).toEqual({
      href: 'https://example.test/library',
      mode: 'replace',
    });
  });

  it('leaves a back press that only closed an overlay alone', () => {
    // `useBackDismiss` pops an entry with the SAME url as the page under it.
    expect(documentLoadFor(here.href, 'traverse', here, '/dashboard', true)).toBeNull();
  });

  it('never reloads the exam runner from a back press — its back guard lives on that pop', () => {
    const runner = at('https://example.test/quizzes/l1/attempt/a1');
    expect(documentLoadFor(runner.href, 'traverse', runner, '/quizzes/l1', true)).toBeNull();
  });

  it('still lets the student leave the runner as a document load', () => {
    // Submitting, or «الخروج من الامتحان» — the runner flushes first, and this
    // is the student's own navigation, not something done to them.
    const runner = at('https://example.test/quizzes/l1/attempt/a1');
    expect(documentLoadFor('/quizzes/l1/attempt/a1/review', 'push', runner, runner.pathname, true)).toEqual(
      { href: 'https://example.test/quizzes/l1/attempt/a1/review', mode: 'assign' },
    );
  });
});

describe('isExamRunnerPath', () => {
  it('is the runner and only the runner', () => {
    expect(isExamRunnerPath('/quizzes/l1/attempt/a1')).toBe(true);
    expect(isExamRunnerPath('/quizzes/l1/attempt/a1/')).toBe(true);
    expect(isExamRunnerPath('/quizzes/l1/attempt/a1/review')).toBe(false);
    expect(isExamRunnerPath('/quizzes/l1')).toBe(false);
  });
});

describe('onRouterTransitionStart (instrumentation-client.ts)', () => {
  const assign = vi.fn();
  const replace = vi.fn();

  beforeEach(() => {
    window.history.replaceState(null, '', '/dashboard');
    vi.stubGlobal('location', { ...window.location, assign, replace });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('lets every navigation stay soft while the tab is current', () => {
    onRouterTransitionStart('/results', 'push');
    expect(assign).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(navigationWasHeld()).toBe(false);
  });

  it('sends a stale tab to the new build on its next navigation, and holds the soft one', async () => {
    const { markTabStale } = await import('./stale-tab');
    markTabStale();

    onRouterTransitionStart('/results', 'push');

    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/results`);
    // What `<StaleNavigationHold>` suspends on — its own test shows the
    // navigation then never commits.
    expect(navigationWasHeld()).toBe(true);
  });
});
