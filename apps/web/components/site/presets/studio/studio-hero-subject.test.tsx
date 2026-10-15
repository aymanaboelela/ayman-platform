import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * «الاستوديو»'s opener on a stack that does not teach code.
 *
 * The panel beside the photograph is real Python («أول برنامج هتكتبه»), and on
 * a chemistry teacher's landing page it was the second-largest thing in the
 * first screen. `studio-landing.test.tsx` already pins the panel on a
 * programming stack (the harness's default environment); this pins its absence
 * everywhere else, and the layout answer for the stage it leaves empty.
 *
 * `TEACHES_CODE` is decided at module load, so the component is re-imported
 * under that stack's environment.
 */
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const saved = { key: process.env.TENANT_KEY, subject: process.env.TENANT_SUBJECT };

afterEach(() => {
  cleanup();
  if (saved.key === undefined) delete process.env.TENANT_KEY;
  else process.env.TENANT_KEY = saved.key;
  if (saved.subject === undefined) delete process.env.TENANT_SUBJECT;
  else process.env.TENANT_SUBJECT = saved.subject;
  vi.resetModules();
});

async function renderOnChemistryStack(portraitKey: string | null) {
  process.env.TENANT_KEY = 'demo';
  process.env.TENANT_SUBJECT = 'chemistry';
  vi.resetModules();
  const { StudioHero } = await import('./studio-hero');
  return render(
    <StudioHero
      eyebrow=""
      headline="الكيمياء صح"
      subheadline=""
      lead=""
      ctaLabel=""
      ctaHref="/register"
      secondaryCtaLabel=""
      secondaryCtaHref="/courses"
      stats={[]}
      portraitKey={portraitKey}
      level={1}
    />,
  );
}

describe('StudioHero on a stack that teaches chemistry', () => {
  it('shows no code panel, with or without a portrait', async () => {
    for (const portraitKey of [null, 'aa/portrait.webp']) {
      const { container } = await renderOnChemistryStack(portraitKey);
      expect(container.querySelector('.st-code')).toBeNull();
      expect(container.textContent).not.toMatch(/print\(|name =/);
      cleanup();
    }
  });

  it('marks the stage empty when there is nothing to stand on it', async () => {
    const { container } = await renderOnChemistryStack(null);
    expect(container.querySelector('.st-hero')?.getAttribute('data-stage-empty')).toBe('true');
  });

  it('keeps the stage for the portrait once there is one', async () => {
    const { container } = await renderOnChemistryStack('aa/portrait.webp');
    expect(container.querySelector('.st-hero')?.hasAttribute('data-stage-empty')).toBe(false);
    expect(container.querySelector('.st-hero__stage img')?.getAttribute('src')).toContain('aa/portrait.webp');
  });
});
