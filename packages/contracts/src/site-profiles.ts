/**
 * The instructor's OFFICIAL profiles — one copy, three consumers.
 *
 * ## Why these are a contract and not three string literals
 *
 * The same four URLs were written out in two places already, and the comment
 * above each said they had to stay identical:
 *
 *   · `apps/web/lib/seo/jsonld.ts` — `SAME_AS`, which asserts to a crawler
 *     that this site and those profiles are ONE entity.
 *   · `apps/web/components/site/site-footer.tsx` — the icons a student taps.
 *
 * A footer that links somewhere `sameAs` does not name quietly contradicts the
 * claim, and the drift had already happened once in each direction: three
 * footer icons pointed at the PLATFORMS' own homepages
 * (`https://www.youtube.com/`), and Instagram was in `sameAs` while the footer
 * never linked it at all. Two lists that must agree are one list.
 *
 * The third consumer is `apps/api/src/scripts/seed.ts`, which is why this
 * lives in `@ayman/contracts` rather than in the web app: the API cannot
 * import from `apps/web`, and production's contact settings have to be
 * seedable from something.
 *
 * ## What is deliberately NOT here
 *
 * A phone number, a WhatsApp number, a WhatsApp channel, a Facebook group, an
 * email. Those are not public knowledge recoverable from the repository, and a
 * guessed contact detail on a live education platform is worse than an empty
 * field — it sends a student somewhere that is not him. They stay `null` until
 * an admin types them into `/admin/settings`.
 */

/**
 * Canonical form, not the share links they were supplied as: an
 * `?igsh=…&utm_source=qr` suffix identifies the SHARE, not the account, and is
 * not guaranteed permanent. Each was resolved by loading it.
 */
export const OFFICIAL_PROFILES = {
  youtube: 'https://www.youtube.com/@2ayman6',
  instagram: 'https://www.instagram.com/2ayman6',
  tiktok: 'https://www.tiktok.com/@2ayman_6',
  facebook: 'https://www.facebook.com/aymanaboelela2',
} as const;

export type OfficialProfileKey = keyof typeof OFFICIAL_PROFILES;

/**
 * `sameAs` order is not meaningful to a crawler, but a stable order keeps the
 * rendered JSON-LD byte-identical between builds — which is what makes a diff
 * of the live page meaningful when checking whether a deploy landed.
 */
export const SAME_AS: readonly string[] = [
  OFFICIAL_PROFILES.youtube,
  OFFICIAL_PROFILES.instagram,
  OFFICIAL_PROFILES.tiktok,
  OFFICIAL_PROFILES.facebook,
];
