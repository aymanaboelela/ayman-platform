import {
  shortFollowerCount,
  visibleSocialCounts,
  type SocialCountNetwork,
} from '@ayman/contracts/admin/social-counts';
import { socialCountsCopy as c } from '@ayman/contracts/copy/social-counts';
import { SOCIAL_MARKS, SocialIcon, inkBrand } from '@/components/site/social-icons';
import { getPublicSettingsOrDefaults, getSocialCounts } from '@/lib/settings';
import { TENANT_CONTACT_FALLBACK } from '@/lib/tenant-contact';

export interface SocialCountItem {
  network: SocialCountNetwork;
  /** The raw figure — what the band's combined total is summed from. */
  count: number;
  /** «+120 ألف» — see `shortFollowerCount`. */
  figure: string;
  /** «مشترك على يوتيوب». */
  label: string;
  /** The stack's own profile, or `null` when none is set — never a bare platform root. */
  href: string | null;
}

/**
 * The counts worth showing, each joined to the profile it is a count OF.
 *
 * The link comes from `contact` — the same setting, and the same
 * `TENANT_CONTACT_FALLBACK` for the window where the API has not answered, as
 * the footer's social row (`footerSocial`), so the number and the footer icon
 * beside it can never point at two different accounts.
 *
 * Empty whenever the feature is off, nothing is entered, or the API is down;
 * every caller renders NOTHING for empty.
 */
export async function loadSocialCountItems(): Promise<readonly SocialCountItem[]> {
  const visible = visibleSocialCounts(await getSocialCounts());
  if (visible.length === 0) return [];

  const { contact } = await getPublicSettingsOrDefaults();
  return visible.map(({ network, count }) => ({
    network,
    count,
    figure: shortFollowerCount(count),
    label: c.networks[network].label,
    href: contact[network] ?? TENANT_CONTACT_FALLBACK[network],
  }));
}

/**
 * «عدد السوشيال ميديا» — one tile per network: the brand mark, the figure, and
 * what it counts.
 *
 * `block` is the BEM root the caller's stylesheet answers to (`pk-social` in
 * the preset kit): the markup is shared, the look belongs to the page it sits
 * in. The classic page does not use this row — it has its own band under the
 * hero, `<SocialProofBand>`, over the same `loadSocialCountItems`.
 *
 * Renders `null` — not an empty list, not a heading — when there is nothing to
 * show, so a stack with the feature off or no numbers typed serves exactly the
 * HTML it served before this existed.
 */
export async function SocialCounts({ block }: { block: string }) {
  const items = await loadSocialCountItems();
  if (items.length === 0) return null;

  return (
    <ul className={block} role="list" aria-label={c.listLabel}>
      {items.map((item) => {
        const mark = SOCIAL_MARKS[item.network];
        const body = (
          <>
            <span className={`${block}__icon`} aria-hidden="true">
              <SocialIcon mark={mark} size={18} />
            </span>
            <span className={`${block}__n`}>{item.figure}</span>
            <span className={`${block}__l`}>{item.label}</span>
          </>
        );
        return (
          <li
            key={item.network}
            className={`${block}__item`}
            // The brand's own colour for the mark, and the variant a dark
            // surface needs — the same pair, read the same way, as the
            // footer's `.social__link` (see `SocialMark.inkHex`).
            style={{
              ['--brand' as string]: mark.hex,
              ['--brand-ink' as string]: inkBrand(mark),
            }}
          >
            {item.href ? (
              <a className={`${block}__link`} href={item.href} target="_blank" rel="noopener noreferrer">
                {body}
              </a>
            ) : (
              <span className={`${block}__link`}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
