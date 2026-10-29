import { z } from '@ayman/contracts/zod';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { formatCopy } from '@ayman/contracts/format';
import { socialCountsCopy as c } from '@ayman/contracts/copy/social-counts';

/**
 * «عدد السوشيال ميديا» — follower counts typed in by the admin, shown on the
 * landing page as social proof.
 *
 * Typed, not fetched: none of the four networks gives a follower count to a
 * site without an app review and a token per account, and a number that is a
 * week old is still the right order of magnitude for «+120 ألف».
 *
 * `null` is "not entered" and renders nothing — distinct from `0`, which is a
 * real count nobody would want shown either, so the landing filters both. The
 * links are NOT here: each count links to the profile already stored in
 * `contact`, so there is exactly one place a handle can change.
 *
 * ⚠️ Not in `SETTINGS_SECTIONS`. The generic `PATCH /admin/settings/:section`
 * has no entitlement gate, so a section there would be writable on a stack
 * where the `socialCounts` feature is off. It has its own route behind
 * `@RequireFeature('socialCounts')` instead.
 *
 * The seed never writes this key, so a new stack's counts are empty until its
 * own admin fills them (CLAUDE.md §2 rule 2).
 */
export const SOCIAL_COUNT_NETWORKS = ['youtube', 'facebook', 'instagram', 'tiktok'] as const;
export type SocialCountNetwork = (typeof SOCIAL_COUNT_NETWORKS)[number];

/** Two billion: above any real account, and a typed extra zero still fits an int. */
const followerCount = z.number().int().min(0).max(2_000_000_000).nullable().default(null);

export const SocialCountsInputSchema = z
  .object({
    youtube: followerCount,
    facebook: followerCount,
    instagram: followerCount,
    tiktok: followerCount,
  })
  .strict();

export type SocialCountsInput = z.infer<typeof SocialCountsInputSchema>;

/**
 * What is stored and returned: the input plus when it was last saved.
 * `updatedAt` is stamped by the API on every save, never sent by the form —
 * a «آخر تحديث» the admin could type would say nothing.
 */
export const SocialCountsSchema = SocialCountsInputSchema.extend({
  updatedAt: z.iso.datetime().nullable().default(null),
}).strict();

export type SocialCounts = z.infer<typeof SocialCountsSchema>;

/**
 * The networks that have a number worth showing, in display order.
 *
 * `0` is dropped alongside `null`: «0 متابع» is not social proof, and an
 * admin who cleared a field by typing 0 meant "don't show it". An empty
 * result is the signal to render NOTHING — no heading, no empty row.
 */
export function visibleSocialCounts(
  counts: SocialCountsInput,
): readonly { network: SocialCountNetwork; count: number }[] {
  return SOCIAL_COUNT_NETWORKS.flatMap((network) => {
    const count = counts[network];
    return count !== null && count > 0 ? [{ network, count }] : [];
  });
}

/**
 * «120 ألف», «+1.2 مليون», «5 آلاف», «850» — a follower count the way it is said.
 *
 * Always rounds DOWN, and says so with a leading «+» whenever it did: social
 * proof that rounds 1,180 up to «1.2 ألف» is a claim the profile itself
 * contradicts one tap later. Under ten of a unit keeps one decimal («1.5 ألف»),
 * from ten up it is whole («120 ألف») — the precision a reader actually takes
 * in at a glance.
 *
 * Integer arithmetic throughout (tenths, not `n / 1000`), so `2300` is
 * exactly «2.3 ألف» rather than whatever `2.3 * 1000` rounds to.
 *
 * Western digits, like every other figure the landing page computes (the
 * profile card's course and hour counts sit beside it).
 */
export function shortFollowerCount(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n < 1000) return String(n);

  const [size, whole, fraction] =
    n < 1_000_000
      ? [1000, c.thousand, c.thousandFraction]
      : [1_000_000, c.million, c.millionFraction];

  // Below ten units: count in tenths of a unit. From ten up: whole units.
  const step = n < size * 10 ? size / 10 : size;
  const steps = Math.floor(n / step);
  const approximate = steps * step < n;

  let figure: string;
  if (step === size) {
    figure = arabicCount(steps, whole);
  } else if (steps % 10 === 0) {
    figure = arabicCount(steps / 10, whole);
  } else {
    figure = formatCopy(fraction, { count: `${Math.floor(steps / 10)}.${steps % 10}` });
  }

  return approximate ? formatCopy(c.approx, { n: figure }) : figure;
}
