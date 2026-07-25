/** The same values as the CSS custom properties, typed, for tests and JS consumers. */

export const space = [2, 4, 8, 12, 16, 20, 24, 32, 48, 64, 80] as const;

export const radius = { xs: 3, sm: 4, md: 6, lg: 8, full: 999 } as const;

export const width = { shell: 1152, prose: 640 } as const;

export const weight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

/** Arabic line-heights run 0.15 above their Latin counterparts. */
export const type = {
  display1: { size: '3.5rem', lineHeightAr: 1.15, lineHeightEn: 1.0, weight: weight.semibold },
  display2: { size: '2.5rem', lineHeightAr: 1.2, lineHeightEn: 1.05, weight: weight.semibold },
  title1: { size: '2rem', lineHeightAr: 1.3, lineHeightEn: 1.15, weight: weight.semibold },
  title2: { size: '1.5rem', lineHeightAr: 1.4, lineHeightEn: 1.25, weight: weight.semibold },
  title3: { size: '1.25rem', lineHeightAr: 1.45, lineHeightEn: 1.3, weight: weight.medium },
  title4: { size: '1.0625rem', lineHeightAr: 1.5, lineHeightEn: 1.35, weight: weight.medium },
  textLg: { size: '1.0625rem', lineHeightAr: 1.75, lineHeightEn: 1.6, weight: weight.regular },
  textBase: { size: '0.9375rem', lineHeightAr: 1.75, lineHeightEn: 1.6, weight: weight.regular },
  textSm: { size: '0.875rem', lineHeightAr: 1.65, lineHeightEn: 1.5, weight: weight.regular },
  textXs: { size: '0.8125rem', lineHeightAr: 1.55, lineHeightEn: 1.4, weight: weight.regular },
  monoLabel: { size: '0.75rem', lineHeightAr: 1.4, lineHeightEn: 1.4, weight: weight.medium },
} as const;

export const motion = {
  easing: {
    linear: 'cubic-bezier(0, 0, 1, 1)',
    base: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    out: 'cubic-bezier(0.3, 0.8, 0.6, 1)',
    inOut: 'cubic-bezier(0.6, 0, 0.2, 1)',
    pop: 'cubic-bezier(0.175, 0.885, 0.32, 1.1)',
    /** Control points of `out`, for assertions about curve shape. */
    outNumbers: [0.3, 0.8, 0.6, 1] as const,
  },
  duration: { hover: 160, popover: 200, modal: 300, exit: 120 },
} as const;

export const color = {
  /** Accent is amber because green and red are load-bearing for quiz correctness. */
  accentSolid: 'oklch(0.770 0.152 72)',
  ok: 'oklch(0.68 0.16 150)',
  err: 'oklch(0.62 0.20 25)',
  warn: 'oklch(0.75 0.14 85)',
  info: 'oklch(0.62 0.14 245)',
  darkBase: '#08090A',
} as const;
