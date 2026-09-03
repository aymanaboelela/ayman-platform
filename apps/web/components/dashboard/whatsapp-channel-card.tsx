import { ArrowLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { SOCIAL_MARKS, SocialIcon } from '@/components/site/social-icons';
import { CardArt } from './card-art';
import { WhatsappChannelLink } from './whatsapp-channel-link';

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
export function WhatsappChannelCard({
  href,
  flush = false,
  variant = 'row',
}: {
  href: string | null;
  /**
   * Drop the card's own bottom margin.
   *
   * `mb-6` is right on the dashboard, where a stack of blocks follows and each
   * one owns the space beneath it. It is wrong on `/welcome`, where the only
   * thing after the card is the button that continues — and there the margin
   * added to the wrapper's own spacing to hold the two things that belong
   * together 48px apart, on a screen with four elements on it.
   *
   * A prop rather than moving the margin to the callers: the dashboard renders
   * this in three places and every one of them relies on it.
   */
  flush?: boolean;
  /**
   * `'row'` is the original: a wide green bar with the mark, two lines and the
   * CTA all on one line. It is still what `/welcome` renders, where the card is
   * one of four things on the screen and has the full width to itself.
   *
   * `'aside'` is the dashboard's, and it is a different shape because it now
   * lives in a 23rem column — «قناة الواتساب دي حطها في جنب في بوكس لوحدها فوق
   * كده بشكل حلو». The row layout at that width put a 44px mark, a title, a
   * subtitle and a button into 368px and the CTA wrapped under the text with
   * the arrow on its own line. The aside form stacks them instead, and opens
   * with the banner drawing the same way its two neighbours in that column do.
   */
  variant?: 'row' | 'aside';
}) {
  if (!href) return null;

  if (variant === 'aside') {
    return (
      <WhatsappChannelLink
        href={href}
        className={cn('aside-card block', !flush && 'mb-4')}
        style={{ '--wa': SOCIAL_MARKS.whatsapp.hex, '--wa-ink': '#0A2E1C' } as React.CSSProperties}
      >
        <CardArt name="channel" />
        <span className="aside-card__body block">
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--wa)] text-white"
            >
              <SocialIcon mark={SOCIAL_MARKS.whatsapp} size={18} />
            </span>
            <span className="aside-card__title min-w-0 flex-1">{c.title}</span>
          </span>
          <span className="aside-card__note block">{c.lead}</span>
          {/* Full width down here rather than a chip at the end of a row: it
              is the only pressable thing in the card and the card is the
              width of a phone button. Dark ink on the green for the contrast
              reason the row variant's own comment sets out at length. */}
          <span className="mt-3 flex items-center justify-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--wa)] px-3 py-2.5 text-[length:var(--fs-text-base)] font-semibold text-[color:var(--wa-ink)]">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {c.cta}
          </span>
        </span>
      </WhatsappChannelLink>
    );
  }

  return (
    /*
      The anchor is a thin client shell (`WhatsappChannelLink`) rather than a
      bare `<a>`, so the press can be RECORDED. «رسايل م. أيمن» invites
      students to this channel every few weeks, and `whatsapp_opened_at` is
      what lets it stop asking someone who has already gone — a teacher who
      keeps reminding you about something you already did is a teacher who is
      not paying attention.

      The card itself stays a Server Component: only the anchor crosses.
    */
    <WhatsappChannelLink
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-[var(--r-lg)] border border-[color-mix(in_oklch,var(--wa),transparent_60%)] bg-[color-mix(in_oklch,var(--wa),var(--n-2)_88%)] p-3.5 transition-colors duration-[160ms] ease-out hover:border-[color-mix(in_oklch,var(--wa),transparent_35%)] sm:p-4',
        !flush && 'mb-6',
      )}
      style={
        {
          '--wa': SOCIAL_MARKS.whatsapp.hex,
          /*
           * The ink for anything sitting ON the green — see the CTA below.
           *
           * A literal, not a theme token. `--wa` is a fixed brand colour in
           * both themes, so its foreground has to be fixed too: `--n-1` would
           * satisfy the check in dark mode and then flip to near-WHITE in
           * light mode, which is the same failure with an extra step.
           *
           * Measured against `#25D366`: 7.45:1, so it clears AAA and not just
           * the 4.5:1 the axe run enforces.
           */
          '--wa-ink': '#0A2E1C',
        } as React.CSSProperties
      }
    >
      {/* This one KEEPS white on the green, and it is not an oversight: it is
          the WhatsApp logotype, which WCAG exempts from contrast entirely and
          which is wrong in any other colours. The CTA below is text, and text
          has no such exemption — hence the two different inks on one card. */}
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
          actually read this. «اشتراك» is six characters.

          ⚠️ Dark ink, NOT white — and that is a consequence of the line above.
          White on `#25D366` is 1.98:1, less than half the 4.5:1 WCAG asks of
          text. It went unnoticed while the word was `hidden` on mobile because
          the only thing left on the green was the arrow, and a graphic is
          judged against 3:1, by a rule axe's `color-contrast` does not run.
          Revealing the word turned a decoration into text and the same colours
          into a serious violation. WhatsApp's own bubbles read dark-on-green
          for exactly this reason. */}
      <span className="flex shrink-0 items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--wa)] px-3 py-2 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--wa-ink)]">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {c.cta}
      </span>
    </WhatsappChannelLink>
  );
}
