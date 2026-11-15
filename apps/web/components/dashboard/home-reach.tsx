import type { CSSProperties } from 'react';
import { Users } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { SOCIAL_MARKS, SocialIcon } from '@/components/site/social-icons';
import { WhatsappChannelLink } from './whatsapp-channel-link';

const c = copy.dashboard;

export type ReachGroup = { courseId: string; courseTitle: string; url: string };

/**
 * «معانا على طول» — the «Cinema» home's one card for every way to reach the
 * platform and each other (his stack; other stacks keep the separate cards).
 *
 * The owner asked for the cohort's WhatsApp group and the WhatsApp channel to
 * be on the home page and easy to see, so both are rows with the WhatsApp
 * mark and a green button with a word on it; Facebook is the one quiet row.
 * The GROUP comes first — it is the one that is theirs (their cohort, their
 * questions). One row per enrolled course that has a group, each named after
 * its course, or two identical rows would be indistinguishable.
 *
 * The channel row's anchor is `WhatsappChannelLink`, as on every other
 * surface, so the press is recorded and «رسايل م. أيمن» stops inviting a
 * student who has already joined.
 *
 * Renders nothing when there is nothing to offer — an empty card is furniture.
 */
export function HomeReach({
  groups,
  channelHref,
  facebookHref,
}: {
  groups: readonly ReachGroup[];
  channelHref: string | null;
  facebookHref: string | null;
}) {
  if (groups.length === 0 && !channelHref && !facebookHref) return null;

  // WhatsApp's own green, set inline exactly as `WhatsappChannelCard` does:
  // a brand mark, not a theme colour. Dark ink on it — white on #25D366 is
  // under 2:1 (that card's comment has the measurement).
  const marks = {
    '--wa': SOCIAL_MARKS.whatsapp.hex,
    '--wa-ink': '#0A2E1C',
    '--fb': SOCIAL_MARKS.facebook.hex,
  } as CSSProperties;

  return (
    <section className="home-reach" aria-labelledby="home-reach-title" style={marks}>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 id="home-reach-title" className="group-head__title">
          {c.reach.title}
        </h2>
      </div>

      <ul className="home-reach__list">
        {groups.map((group) => (
          <li key={group.courseId} className="home-reach__row">
            <span className="home-reach__disc home-reach__disc--wa" aria-hidden="true">
              <Users className="size-5" />
            </span>
            <span className="home-reach__text">
              <span className="home-reach__title">{c.reach.groupTitle}</span>
              <span className="home-reach__lead">{group.courseTitle}</span>
            </span>
            {/* `target="_blank"` and `noopener` like every outbound link here. */}
            <a
              href={group.url}
              target="_blank"
              rel="noopener noreferrer"
              className="home-reach__btn home-reach__btn--wa"
            >
              {c.reach.groupCta}
            </a>
          </li>
        ))}

        {channelHref ? (
          <li className="home-reach__row">
            <span className="home-reach__disc home-reach__disc--wa" aria-hidden="true">
              <SocialIcon mark={SOCIAL_MARKS.whatsapp} size={20} />
            </span>
            <span className="home-reach__text">
              <span className="home-reach__title">{c.whatsappChannel.title}</span>
              <span className="home-reach__lead">{c.reach.channelLead}</span>
            </span>
            <WhatsappChannelLink href={channelHref} className="home-reach__btn home-reach__btn--wa">
              {c.whatsappChannel.cta}
            </WhatsappChannelLink>
          </li>
        ) : null}

        {facebookHref ? (
          <li className="home-reach__row">
            <span className="home-reach__disc home-reach__disc--fb" aria-hidden="true">
              <SocialIcon mark={SOCIAL_MARKS.facebook} size={20} />
            </span>
            <span className="home-reach__text">
              <span className="home-reach__title">{c.facebookGroup.title}</span>
              <span className="home-reach__lead">{c.reach.facebookLead}</span>
            </span>
            <a
              href={facebookHref}
              target="_blank"
              rel="noopener noreferrer"
              className="home-reach__btn"
            >
              {c.reach.facebookCta}
            </a>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
