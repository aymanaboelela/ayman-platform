import { act, render, screen, cleanup } from '@testing-library/react';
import { createRef, startTransition, useImperativeHandle, useState, type Ref } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A stale tab's next page is a document load, and the soft navigation Next
 * dispatches alongside it must never commit. If it did, the old build would
 * render the target and `pushState` would add an entry the document load
 * then adds again, so back needed two presses. Pinned with real React, because
 * what is being relied on is React's own rule that a transition does not
 * commit while part of it is suspended.
 */

let modules: {
  StaleNavigationHold: typeof import('./stale-navigation-hold').StaleNavigationHold;
  holdNavigation: typeof import('@/lib/stale-navigation').holdNavigation;
};

beforeEach(async () => {
  // Fresh module state: whether this document has held is per document.
  vi.resetModules();
  const [component, lib] = await Promise.all([
    import('./stale-navigation-hold'),
    import('@/lib/stale-navigation'),
  ]);
  modules = { StaleNavigationHold: component.StaleNavigationHold, holdNavigation: lib.holdNavigation };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface RouterHandle {
  navigate: (to: string) => void;
  type: (text: string) => void;
}

/** Stands in for the router: its page state moves in a transition, as Next's does. */
function Router({ ref }: { ref: Ref<RouterHandle> }) {
  const [page, setPage] = useState('dashboard');
  const [text, setText] = useState('');
  useImperativeHandle(ref, () => ({ navigate: setPage, type: setText }), []);
  return (
    <>
      <p>page:{page}</p>
      <p>typed:{text}</p>
    </>
  );
}

const router = createRef<RouterHandle>();
const navigate = (to: string) => router.current!.navigate(to);
const type = (text: string) => router.current!.type(text);

function App() {
  const { StaleNavigationHold } = modules;
  return (
    <>
      <StaleNavigationHold />
      <Router ref={router} />
    </>
  );
}

describe('StaleNavigationHold', () => {
  it('lets a navigation commit while nothing is held — the control', async () => {
    render(<App />);
    await act(async () => {
      startTransition(() => navigate('results'));
    });
    expect(screen.getByText('page:results')).toBeInTheDocument();
  });

  it('keeps a held navigation from ever committing: the page stays as it was', async () => {
    render(<App />);
    // The order `onRouterTransitionStart` runs in: the hook, then the dispatch,
    // both inside the router's transition.
    await act(async () => {
      startTransition(() => {
        modules.holdNavigation();
        navigate('results');
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByText('page:dashboard')).toBeInTheDocument();
    expect(screen.queryByText('page:results')).toBeNull();
  });

  it('leaves the page usable meanwhile: an ordinary update still commits', async () => {
    render(<App />);
    await act(async () => {
      startTransition(() => {
        modules.holdNavigation();
        navigate('results');
      });
    });
    await act(async () => {
      type('still typing');
    });

    expect(screen.getByText('typed:still typing')).toBeInTheDocument();
    expect(screen.getByText('page:dashboard')).toBeInTheDocument();
  });

  it('loads a held document fresh when the back-forward cache brings it back', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<App />);

    const restored = () => {
      const event = new Event('pageshow') as PageTransitionEvent;
      Object.defineProperty(event, 'persisted', { value: true });
      window.dispatchEvent(event);
    };

    restored();
    expect(reload).not.toHaveBeenCalled();

    await act(async () => {
      startTransition(() => {
        modules.holdNavigation();
        navigate('results');
      });
    });
    restored();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
