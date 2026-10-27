/**
 * The tenant's brand colours, read off the page the admin is looking at.
 *
 * The admin shell already carries the stack's branding — `renderBrandingStyle`
 * inlines `--p-*` (the primary ramp) and `--a-*` (the accent) for whatever
 * the teacher picked in «الهوية» — so the post is drawn in the SAME colours
 * as their site with no second source of truth and no setting to drift.
 *
 * A canvas cannot read a custom property, so each token is resolved through a
 * throwaway element's computed `color`: the browser does the `var()` and
 * `color-mix()` work and hands back a colour string `fillStyle` accepts.
 */
export interface SocialPalette {
  /** The darkest ground — the bottom of the gradient. */
  deep: string;
  /** The top of the gradient. */
  mid: string;
  /** Highlights: chips, rings, the big numbers. */
  accent: string;
  /** A light tint of the primary, for secondary text on the dark ground. */
  soft: string;
  gold: string;
}

const TOKENS: Record<keyof SocialPalette, [token: string, fallback: string]> = {
  deep: ['--p-950', '#140f2e'],
  mid: ['--p-700', '#3b2a8c'],
  accent: ['--a-9', '#f5a524'],
  soft: ['--p-200', '#d9d3ff'],
  gold: ['--print-gold', '#e9b949'],
};

export function resolvePalette(root: HTMLElement = document.body): SocialPalette {
  const probe = document.createElement('span');
  probe.hidden = true;
  root.append(probe);
  try {
    const read = ([token, fallback]: [string, string]) => {
      probe.style.color = fallback;
      probe.style.color = `var(${token}, ${fallback})`;
      return getComputedStyle(probe).color || fallback;
    };
    return {
      deep: read(TOKENS.deep),
      mid: read(TOKENS.mid),
      accent: read(TOKENS.accent),
      soft: read(TOKENS.soft),
      gold: read(TOKENS.gold),
    };
  } finally {
    probe.remove();
  }
}
