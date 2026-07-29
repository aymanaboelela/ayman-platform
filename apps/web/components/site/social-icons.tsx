import { siFacebook, siTiktok, siWhatsapp, siYoutube } from 'simple-icons';

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
};

export const SOCIAL_MARKS = {
  youtube: { path: siYoutube.path, title: siYoutube.title, hex: `#${siYoutube.hex}` },
  tiktok: { path: siTiktok.path, title: siTiktok.title, hex: `#${siTiktok.hex}` },
  facebook: { path: siFacebook.path, title: siFacebook.title, hex: `#${siFacebook.hex}` },
  whatsapp: { path: siWhatsapp.path, title: siWhatsapp.title, hex: `#${siWhatsapp.hex}` },
} as const satisfies Record<string, SocialMark>;

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
