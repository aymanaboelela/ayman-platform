import type { ReactNode } from 'react';
import {
  Building2,
  CalendarClock,
  Clock3,
  GraduationCap,
  Languages,
  MessageCircle,
  Phone,
  School,
  Smartphone,
  UserRound,
  Wallet,
} from 'lucide-react';
import {
  reservationGradeLabel,
  type AdminReservation,
  type ReservationStatus,
} from '@ayman/contracts/center-reservations';
import { formatSlotTime } from '@ayman/contracts/centers';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { formatCopy } from '@ayman/contracts/format';
import { egyptianPhoneForLabel } from '@ayman/contracts/phone';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { cn } from '@ayman/ui/lib/cn';
import { formatEGP } from '@/lib/price';
import { Chip, Ltr, ROW_BUTTON, ROW_BUTTON_TONE, TINT_WELL, TONE_TEXT, tone } from '../centers-ui';
import { ScreenshotButton } from './reservation-controls';

const a = reservationsCopy.admin;
const page = reservationsCopy.page;

/** One colour per status, on every surface that shows a reservation. */
export const STATUS_HUE: Record<ReservationStatus, string> = {
  started: 'var(--warn)',
  submitted: 'var(--info)',
  confirmed: 'var(--ok)',
  rejected: 'var(--err)',
  cancelled: 'var(--n-9)',
};

const cairoTime = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Africa/Cairo',
});
export const whenOf = (iso: string) => cairoTime.format(new Date(iso));

/**
 * One reservation as a card — the dashboard's row and the centre owner's row
 * are the same object, so they cannot drift. `actions` is the dashboard's
 * decision buttons; the centre owner's panel passes none.
 */
export function ReservationCard({
  reservation: r,
  screenshotSrc,
  actions,
  showCenter = true,
}: {
  reservation: AdminReservation;
  /** Where this reader may fetch the screenshot from — the routes differ by permission. */
  screenshotSrc: string | null;
  actions?: ReactNode;
  showCenter?: boolean;
}) {
  const hue = STATUS_HUE[r.status];
  const phone = egyptianPhoneForLabel(r.phone);
  const wa = waMeHref(r.phone);
  const rail = r.paymentMethod === 'vodafoneCash' ? a.railVodafoneCash : r.paymentMethod === 'instapay' ? a.railInstapay : null;

  return (
    <article
      style={tone(hue)}
      className="overflow-hidden rounded-xl border border-s-4 border-line border-s-[color:var(--ct-tone)] bg-surface-2"
    >
      <div className="flex flex-col gap-3 p-4">
        <header className="flex items-start gap-3">
          <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', TINT_WELL)}>
            <UserRound className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 text-[length:var(--fs-title-4)] font-semibold text-fg [overflow-wrap:anywhere]">
                {r.fullName}
              </h3>
              <Chip color={hue}>{a.status[r.status]}</Chip>
              {r.checkedInAt ? (
                <Chip color="var(--ok)">{formatCopy(a.attendedAt, { date: whenOf(r.checkedInAt) })}</Chip>
              ) : null}
              {r.linked ? <Chip color="var(--viz-3)">{a.linked}</Chip> : null}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              <span className={cn('font-semibold', TONE_TEXT)}>
                <Ltr>#{r.number}</Ltr>
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" aria-hidden="true" />
                {formatCopy(a.createdAt, { date: whenOf(r.createdAt) })}
              </span>
            </p>
          </div>
        </header>

        {/* The phone first and biggest: the centre's next move is a call. */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`tel:${r.phone}`}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-3 px-3 py-2 text-[length:var(--fs-text-base)] font-semibold text-fg hover:bg-surface-4"
          >
            <Phone className="size-4 text-[color:var(--ok)]" aria-hidden="true" />
            <Ltr>{phone}</Ltr>
          </a>
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              style={tone('var(--ok)')}
              className={cn(ROW_BUTTON, ROW_BUTTON_TONE)}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              {a.whatsapp}
            </a>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {showCenter ? (
            <Chip color="var(--viz-2)" icon={Building2}>
              {r.centerName}
            </Chip>
          ) : null}
          {r.slot ? (
            <Chip color="var(--viz-1)" icon={Clock3}>
              {r.slot.label ? `${r.slot.label} · ` : ''}
              {formatSlotTime(r.slot)}
            </Chip>
          ) : null}
          <Chip color="var(--viz-3)" icon={GraduationCap}>
            {reservationGradeLabel(r.gradeSlug)}
          </Chip>
          {r.track ? (
            <Chip color="var(--viz-5)" icon={Languages}>
              {r.track === 'arabic' ? page.trackArabic : page.trackLanguages}
            </Chip>
          ) : null}
          {r.system ? (
            <Chip color="var(--viz-4)" icon={School}>
              {r.system === 'azhar' ? page.systemAzhar : page.systemGeneral}
            </Chip>
          ) : null}
          {r.gender ? (
            <Chip color="var(--viz-6)" icon={UserRound}>
              {r.gender === 'female' ? page.genderFemale : page.genderMale}
            </Chip>
          ) : null}
        </div>

        {/* The money block. */}
        <div className="flex items-stretch gap-3 rounded-lg border border-line bg-surface-1 p-3">
          {screenshotSrc && r.hasScreenshot ? (
            <ScreenshotButton src={screenshotSrc} title={`${r.fullName} — #${r.number}`} />
          ) : null}
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 text-[length:var(--fs-text-sm)]">
            <div className="min-w-0">
              <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{a.deposit}</dt>
              <dd className="inline-flex items-center gap-1 font-semibold text-fg">
                <Wallet className="size-3.5 text-[color:var(--a-11)]" aria-hidden="true" />
                <Ltr>{formatEGP(r.amountCents)}</Ltr> ج
              </dd>
              {r.sessionPriceCents ? (
                <dd className="text-[length:var(--fs-text-xs)] text-fg-muted">
                  {a.sessionPriceLabel}: <Ltr>{formatEGP(r.sessionPriceCents)}</Ltr> ج
                </dd>
              ) : null}
            </div>
            {r.senderPhone ? (
              <div className="min-w-0">
                <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{a.sender}</dt>
                <dd className="inline-flex items-center gap-1 font-semibold text-fg">
                  <Smartphone className="size-3.5 text-[color:var(--info)]" aria-hidden="true" />
                  <Ltr>{egyptianPhoneForLabel(r.senderPhone)}</Ltr>
                </dd>
              </div>
            ) : (
              <div className="min-w-0 self-center text-[length:var(--fs-text-xs)] text-fg-muted">{a.noScreenshot}</div>
            )}
            {rail ? (
              <div className="min-w-0 text-[length:var(--fs-text-xs)] text-fg-muted">{formatCopy(a.via, { rail })}</div>
            ) : null}
            {r.submittedAt ? (
              <div className="min-w-0 text-[length:var(--fs-text-xs)] text-fg-muted">
                {formatCopy(a.submittedAt, { date: whenOf(r.submittedAt) })}
              </div>
            ) : null}
          </dl>
        </div>

        {r.status === 'rejected' && r.rejectionReason ? (
          <p className="rounded-lg bg-[color-mix(in_oklab,var(--err)_10%,var(--n-2))] px-3 py-2 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
            {formatCopy(a.reasonLabel, { reason: r.rejectionReason })}
          </p>
        ) : null}
        {r.reviewedAt && r.status !== 'rejected' ? (
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{formatCopy(a.reviewed, { date: whenOf(r.reviewedAt) })}</p>
        ) : null}

        {actions ? <div className="border-t border-line pt-3">{actions}</div> : null}
      </div>
    </article>
  );
}
