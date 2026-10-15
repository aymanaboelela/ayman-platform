import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The `yearTracks` block on a stack that does not teach code.
 *
 * Rendered through `<YearTracks>` itself — the component the landing page
 * mounts — so what is asserted is the choice AND the cards: a physics
 * teacher's page must not carry an editor window, a line of JavaScript, a
 * status bar or a link to the code glossary, and must carry the three years.
 *
 * The decorative border is a canvas the harness cannot draw, and the ramp
 * read needs a stylesheet, so both are stubbed to their resting state; neither
 * decides what the section SAYS.
 */
vi.mock('@/components/site/electric-card', () => ({
  ElectricCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/ramp-color', () => ({ useRampHex: (_step: number, fallback: string) => fallback }));
// The code cards' scroll scene registers GSAP plugins at import time, against
// a `matchMedia` jsdom does not have. Nothing of it runs on this stack — the
// module only has to load.
vi.mock('@/lib/gsap', () => ({ gsap: {}, ScrollTrigger: {} }));

const saved = { key: process.env.TENANT_KEY, subject: process.env.TENANT_SUBJECT };

afterEach(() => {
  cleanup();
  if (saved.key === undefined) delete process.env.TENANT_KEY;
  else process.env.TENANT_KEY = saved.key;
  if (saved.subject === undefined) delete process.env.TENANT_SUBJECT;
  else process.env.TENANT_SUBJECT = saved.subject;
  vi.resetModules();
});

async function renderOnPhysicsStack() {
  process.env.TENANT_KEY = 'demo';
  process.env.TENANT_SUBJECT = 'physics';
  vi.resetModules();
  const { YearTracks } = await import('./year-tracks');
  return render(<YearTracks />);
}

describe('YearTracks on a stack that teaches physics', () => {
  it('draws no code at all', async () => {
    const { container } = await renderOnPhysicsStack();
    expect(container.querySelector('.track__editor')).toBeNull();
    expect(container.querySelector('.tracks__glyphs')).toBeNull();
    expect(container.textContent).not.toMatch(/\.js|const |function |build passing|كود/);
  });

  it('does not send anyone to the code glossary', async () => {
    const { container } = await renderOnPhysicsStack();
    expect(container.querySelector('a[href="/essentials"]')).toBeNull();
  });

  it('offers the three years of secondary school, each to its own page', async () => {
    const { container } = await renderOnPhysicsStack();
    const hrefs = [...container.querySelectorAll('a.track')].map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['/years/1', '/years/2', '/years/3']);
    expect(container.textContent).toContain('الصف الثالث');
  });

  it('keeps the section anchor the nav links to', async () => {
    const { container } = await renderOnPhysicsStack();
    expect(container.querySelector('section#years')).not.toBeNull();
  });
});
