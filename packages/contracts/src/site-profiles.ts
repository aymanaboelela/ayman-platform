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
 * A phone number, a Facebook group, an email. Those are not public knowledge
 * recoverable from the repository, and a guessed contact detail on a live
 * education platform is worse than an empty field — it sends a student
 * somewhere that is not him. They stay `null` until an admin types them into
 * `/admin/settings`.
 *
 * The WhatsApp pair WAS in that list until Ayman supplied both on 2026-08-16.
 * They are not guesses now, so they are seeded like the other four — as their
 * own constants below, for the reason recorded there.
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

/**
 * The two WhatsApp destinations, supplied by Ayman on 2026-08-16.
 *
 * ## Why they are NOT in `OFFICIAL_PROFILES`
 *
 * That object has an invariant its own spec enforces: every entry appears in
 * `SAME_AS`. `sameAs` is a claim to a crawler that a URL identifies the SAME
 * entity as this site — which is true of a YouTube channel or an Instagram
 * account, and is not true of either of these. A broadcast channel is a feed
 * nobody can reply into, and `wa.me/<number>` is an action, not a profile
 * page. Adding them there would have made the seed and the footer work by
 * quietly widening what `sameAs` asserts.
 *
 * Separate constants, same lifecycle: seeded fill-if-empty into
 * `site_settings.contact`, editable afterwards from `/admin/settings`, and
 * read from the SETTING everywhere — the footer, the dashboard band and
 * المساعد's panel all take the stored value, never these literals.
 */
export const OFFICIAL_WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029VbDg0RG59PwNOoHE4l0i';

/**
 * The number in E.164, which is what `ContactSchema.whatsapp` accepts and what
 * `wa.me` needs once the `+` is stripped.
 *
 * Supplied as «0102 1196367» — the national form. The leading `0` is Egypt's
 * trunk prefix and is REPLACED by the country code rather than kept after it:
 * `+200102…` is not a number that exists.
 */
export const OFFICIAL_WHATSAPP_E164 = '+201021196367';

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
