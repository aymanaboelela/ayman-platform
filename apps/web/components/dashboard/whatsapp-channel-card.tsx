import { ArrowLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { SOCIAL_MARKS, SocialIcon } from '@/components/site/social-icons';

const c = copy.dashboard.whatsappChannel;

/**
 * «قناة الواتساب» — the first thing on the student's home screen.
 *
 * ## Why it is above the resume card
 *
 * Because that is what it is for. Everything else on this page is about work
 * already started; this is the one block whose job is to reach a student who is
 * NOT on the platform — the announcement that a lesson went up, that an exam
 * moved. A student who never joins the channel only finds out by opening the
 * site, which is the habit the channel exists to replace.
 *
 * ## Why green, on a page that says orange is what you press
 *
 * The dashboard's rule is that amber marks the ONE primary action, and this
 * does not take it — the resume card keeps it, directly below. WhatsApp green
 * is doing the opposite job: it says "this button leaves the platform", the
 * same way the footer's social row does. A second amber button here would make
 * the student choose between two things that look equally like the next step.
 *
 * ## Why it renders nothing when the setting is empty
 *
 * `contact.whatsappChannel` is admin-editable and starts `null`. A card that
 * falls back to `https://whatsapp.com/` would put a link to WhatsApp's own
 * marketing page at the top of every student's home screen — the exact bug the
 * footer's own comment records having shipped once.
 */
export function WhatsappChannelCard({ href }: { href: string | null }) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="mb-6 flex items-center gap-3 rounded-[var(--r-lg)] border border-[color-mix(in_oklch,var(--wa),transparent_60%)] bg-[color-mix(in_oklch,var(--wa),var(--n-2)_88%)] p-3.5 transition-colors duration-[160ms] ease-out hover:border-[color-mix(in_oklch,var(--wa),transparent_35%)] sm:p-4"
      style={{ '--wa': SOCIAL_MARKS.whatsapp.hex } as React.CSSProperties}
    >
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--wa)] text-white"
      >
        <SocialIcon mark={SOCIAL_MARKS.whatsapp} size={22} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[length:var(--fs-text-base)] font-semibold text-fg">
          {c.title}
        </span>
        <span className="mt-0.5 block text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</span>
      </span>

      {/* A real button shape, not a bare arrow: this row is the whole target,
          and the shape is what tells a thumb there is something to press.

          The WORD stays at every width. It was `hidden sm:inline` and the phone
          got a green square with an arrow in it — which says "go somewhere",
          not "subscribe", on the one screen size where most of these students
          actually read this. «اشترك» is five characters. */}
      <span className="flex shrink-0 items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--wa)] px-3 py-2 text-[length:var(--fs-text-sm)] font-medium text-white">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {c.cta}
      </span>
    </a>
  );
}
