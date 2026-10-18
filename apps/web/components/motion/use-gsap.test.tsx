import { cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no `matchMedia`, and ScrollTrigger asks for it the moment
// `lib/gsap.ts` registers it — so it must exist before that import runs.
vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const { gsap, ScrollTrigger } = await import('@/lib/gsap');
const { useGsap } = await import('./use-gsap');
type GsapContext = import('./use-gsap').GsapContext;

/**
 * An animation that throws must leave the page standing — the landing page
 * recorded «Cannot read properties of null (reading 'replace')» from inside an
 * animation's first frame, and the whole route was replaced by its error
 * screen over a decoration.
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/*
 * ScrollTrigger arms a 34 ms `setTimeout` that calls `requestAnimationFrame`.
 * Left pending, it fires after Vitest has torn jsdom down and fails the run
 * with «requestAnimationFrame is not defined» (CI, 2026-10-18), even though
 * every test passed. Kill the triggers and let that timer fire while the
 * window still exists.
 */
afterAll(async () => {
  ScrollTrigger.killAll();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

function Section({ setup }: { setup: (ctx: GsapContext) => void }) {
  const scope = useRef<HTMLElement>(null);
  useGsap(setup, scope);
  return (
    <section ref={scope}>
      <h2 className="title">العنوان</h2>
    </section>
  );
}

describe('useGsap', () => {
  it('keeps the page when an animation throws while starting, and undoes what it began', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setup = ({ scope }: GsapContext) => {
      // A tween that took effect before the throw: its inline style must not
      // be left behind, or the heading would stay invisible.
      gsap.set(scope.querySelector('.title'), { opacity: 0 });
      throw new TypeError("Cannot read properties of null (reading 'replace')");
    };

    expect(() => render(<Section setup={setup} />)).not.toThrow();

    const title = screen.getByRole('heading', { name: 'العنوان' });
    expect(title.style.opacity).toBe('');
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('leaves GSAP’s current context alone after a failure', () => {
    // A throw straight out of `gsap.context()` would leave GSAP filing every
    // later tween on the page into the failed context — and reverting it.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Section
        setup={() => {
          throw new Error('boom');
        }}
      />,
    );

    const outside = document.createElement('div');
    document.body.append(outside);
    gsap.set(outside, { x: 10 });
    expect(gsap.getProperty(outside, 'x')).toBe(10);
    outside.remove();
  });
});
