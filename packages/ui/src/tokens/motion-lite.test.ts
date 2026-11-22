import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'motion.css'), 'utf8');

/** The declarations of the first rule whose selector list matches `selector`. */
function declarations(selector: RegExp): string[] {
  const match = css.match(new RegExp(`${selector.source}[^{]*\\{([^}]*)\\}`, 's'));
  if (!match) throw new Error(`no rule for ${selector}`);
  return match[1]!
    .split(';')
    .map((d) => d.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

describe('the lite-mode backstop (data-fx="lite")', () => {
  const reduced = declarations(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after\s*/);
  const lite = declarations(/:root\[data-fx='lite'\] \*::after\s*/);

  // Everything already built to look right under reduced motion then looks
  // right on a weak machine too — the lite backstop must not quietly lose one.
  it('carries every line of the reduced-motion backstop', () => {
    for (const line of reduced) expect(lite).toContain(line);
  });

  it('also drops frosted glass and stops scroll-driven animations scrubbing', () => {
    expect(lite).toContain('backdrop-filter: none !important');
    expect(lite).toContain('-webkit-backdrop-filter: none !important');
    expect(lite).toContain('animation-timeline: auto !important');
  });
});
