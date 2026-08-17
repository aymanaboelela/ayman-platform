import { siFacebook, siInstagram, siTiktok, siWhatsapp, siYoutube } from 'simple-icons';

/**
 * Real brand marks, from `simple-icons`.
 *
 * The earlier hand-drawn approximations were a bad trade: they existed to avoid
 * shipping trademarked artwork, but a rounded rectangle with a triangle in it
 * does not read as "YouTube", and an unrecognisable social row is worse than no
 * social row. `simple-icons` is the established answer — the marks are CC0-1.0
 * and the package is the same one most design systems use for exactly this.
 *
 * Each entry carries the brand's own hex, exposed as `--brand` so the footer
 * can colour a hover state with it without hard-coding six more values.
 *
 * Named imports rather than the default export: the package sets
 * `sideEffects: false`, so the bundler drops the other ~3,000 icons.
 */
export type SocialMark = {
  /** SVG path data for a 24×24 viewBox. */
  path: string;
  title: string;
  /** The brand's official colour, `#rrggbb`. */
  hex: string;
  /**
   * The colour to use on a panel that is dark in BOTH themes — `--ink`, the
   * hero stage, the links page. Present only where `hex` is unusable there.
   *
   * TikTok is the only such mark and it is not an edge case: its official
   * colour IS `#000000`, so on `--ink` (`oklch(0.155 0.008 65)` → `#0f0c09`) the
   * glyph measures **1.08:1** against its own plate — invisible, which is how
   * it shipped and what got reported. Its two other brand colours are the
   * answer the brand itself uses: TikTok's own dark UI draws the mark in white
   * with cyan `#25F4EE` and red `#FE2C55` offsets. The cyan reads at
   * **14.17:1** on ink, and keeps the row coloured rather than turning it into
   * the one grey tile in a coloured set.
   *
   * NOT applied on the marketing footer, which follows the theme: on a light
   * surface `#000000` is correct and `#25F4EE` would fail (1.5:1). This is a
   * property of the SURFACE, so only always-dark consumers read it.
   */
  inkHex?: string;
};

export const SOCIAL_MARKS = {
  youtube: { path: siYoutube.path, title: siYoutube.title, hex: `#${siYoutube.hex}` },
  instagram: { path: siInstagram.path, title: siInstagram.title, hex: `#${siInstagram.hex}` },
  tiktok: {
    path: siTiktok.path,
    title: siTiktok.title,
    hex: `#${siTiktok.hex}`,
    inkHex: '#25F4EE',
  },
  facebook: { path: siFacebook.path, title: siFacebook.title, hex: `#${siFacebook.hex}` },
  whatsapp: { path: siWhatsapp.path, title: siWhatsapp.title, hex: `#${siWhatsapp.hex}` },
} as const satisfies Record<string, SocialMark>;

/**
 * The brand colour to paint `mark` in, on a surface that is dark in both
 * themes. Everything without an `inkHex` is already legible there.
 */
export function inkBrand(mark: SocialMark): string {
  return mark.inkHex ?? mark.hex;
}

export type SocialKey = keyof typeof SOCIAL_MARKS;

export function SocialIcon({ mark, size = 20 }: { mark: SocialMark; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-hidden="true"
    >
      <path d={mark.path} />
    </svg>
  );
}
