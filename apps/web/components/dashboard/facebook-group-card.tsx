import { ArrowLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { SOCIAL_MARKS, SocialIcon } from '@/components/site/social-icons';

const c = copy.dashboard.facebookGroup;

/**
 * «جروب الفيسبوك» — the aside box under «قناة الواتساب» on the student's home.
 *
 * The same shape as `WhatsappChannelCard`'s `'aside'` variant on purpose: two
 * boxes that both leave the platform should read as a pair, each in its own
 * brand colour, and neither takes the page's one amber action.
 *
 * A plain anchor, not `WhatsappChannelLink`: that shell exists to record
 * `whatsapp_opened_at` for the outreach reminders, and nothing reminds a
 * student about the group — so there is nothing to record and the card stays
 * entirely server-rendered.
 *
 * Renders nothing while `contact.facebookGroup` is empty, which is every stack
 * until its admin pastes a link in «إعدادات المنصة» — no tenant gate needed.
 */
export function FacebookGroupCard({ href }: { href: string | null }) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="aside-card block"
      style={
        {
          '--fb': SOCIAL_MARKS.facebook.hex,
          /* White on #0866FF is 5.1:1 — unlike WhatsApp's green, Facebook's
             blue carries white text above the 4.5:1 line. */
          '--fb-ink': '#FFFFFF',
        } as React.CSSProperties
      }
    >
      <span className="panel-head" data-hue="fb">
        <span aria-hidden="true" className="panel-head__icon">
          <SocialIcon mark={SOCIAL_MARKS.facebook} size={22} />
        </span>
        <span className="panel-head__text">
          <span className="panel-head__title block">{c.title}</span>
          <span className="panel-head__lead block">{c.lead}</span>
        </span>
      </span>
      <span className="aside-card__body block">
        <span className="flex items-center justify-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--fb)] px-3 py-2.5 text-[length:var(--fs-text-base)] font-semibold text-[color:var(--fb-ink)]">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {c.cta}
        </span>
      </span>
    </a>
  );
}
