import Link from 'next/link';
import { BadgeCheck, CalendarClock } from 'lucide-react';
import { create as createQr } from 'qrcode';
import {
  attendanceCodeFor,
  formatSlotTime,
  type AttendanceMode,
  type MyCenterBooking,
  type StudyType,
} from '@ayman/contracts/centers';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { UserAvatar } from '@/components/app/user-avatar';
import { code128Bars } from '@/lib/code128';
import { tenantName } from '@/lib/tenant';
import './centers.css';

const c = copy.centers;

/**
 * «كارت الحضور» — what the student holds up at the centre's door.
 *
 * A SERVER component, and that is the reason both codes are drawn here rather
 * than by a library in the browser: the QR matrix comes from `qrcode` on the
 * server and the barcode from `lib/code128.ts`, and what reaches the page is
 * two plain `<svg>`s. No encoder ships to the phone, which is where this card
 * is opened — in a queue, on mobile data.
 *
 * Both codes carry the same payload, `attendanceCodeFor(studentNumber)`
 * (`ST4373`): the QR for a phone-camera scanner, the Code 128 for a USB
 * barcode gun, and the number printed large for the person at the door when
 * neither works.
 */
export function AttendanceCard({
  name,
  image,
  studentNumber,
  studyType,
  attendanceMode,
  booking,
}: {
  name: string;
  image: string | null;
  studentNumber: number;
  studyType: StudyType | null;
  attendanceMode: AttendanceMode | null;
  booking: MyCenterBooking['booking'];
}) {
  const code = attendanceCodeFor(studentNumber);

  return (
    <div className="ctr-id">
      <div className="ctr-id__band">
        <p className="ctr-id__issuer">
          <BadgeCheck aria-hidden="true" className="size-5 shrink-0" />
          {/* Through the tenant gate: another teacher's students must not
              carry this platform's name on their card. */}
          <span>{tenantName(copy.site.name)}</span>
        </p>
        <span className="ctr-id__kind">{c.cardTitle}</span>
      </div>

      <div className="ctr-id__who">
        <UserAvatar name={name} image={image} size={72} className="ctr-id__photo" />
        <p className="ctr-id__name">{name}</p>
      </div>

      <div className="ctr-id__facts">
        <span className="ctr-id__number">{formatCopy(c.cardId, { id: studentNumber })}</span>
        {studyType ? (
          <span className="ctr-chip" data-tone={studyType}>
            {studyType === 'general' ? c.studyGeneralHint : c.studyAzhariHint}
          </span>
        ) : null}
        {attendanceMode ? (
          <span className="ctr-chip" data-tone={attendanceMode}>
            {attendanceMode === 'center' ? c.attendanceCenter : c.attendanceOnline}
          </span>
        ) : null}
      </div>

      <div className="ctr-id__codes">
        <QrCode text={code} label={formatCopy(c.cardQrLabel, { code })} />
        <div className="ctr-id__barcode">
          <Barcode text={code} label={formatCopy(c.cardBarcodeLabel, { code })} />
          <span className="ctr-id__payload" aria-hidden="true">
            {code}
          </span>
        </div>
      </div>

      <SlotLine attendanceMode={attendanceMode} booking={booking} />
    </div>
  );
}

function SlotLine({
  attendanceMode,
  booking,
}: {
  attendanceMode: AttendanceMode | null;
  booking: MyCenterBooking['booking'];
}) {
  if (booking) {
    return (
      <div className="ctr-id__slot">
        <span className="ctr-id__slot-icon" aria-hidden="true">
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="ctr-id__slot-label">{c.cardBooking}</p>
          <p className="ctr-id__slot-value">{booking.centerName}</p>
          <p className="ctr-id__slot-value">{formatSlotTime(booking.slot)}</p>
        </div>
      </div>
    );
  }

  if (attendanceMode === 'center') {
    return (
      <div className="ctr-id__slot">
        <span className="ctr-id__slot-icon" aria-hidden="true">
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="ctr-id__slot-value">{c.cardNoBooking}</p>
          <Link href="/settings/section" className="ctr-id__slot-link">
            {c.cardPickSlot}
          </Link>
        </div>
      </div>
    );
  }

  // Asked, and answered «أونلاين». A profile that was never asked (a stack
  // with no centre) gets no line at all rather than a sentence about a door.
  if (attendanceMode === 'online') {
    return (
      <div className="ctr-id__slot">
        <p className="text-[length:var(--fs-text-xs)] leading-relaxed text-fg-muted">{c.cardOnline}</p>
      </div>
    );
  }

  return null;
}

/**
 * The QR as a single path of one-module-tall runs, one `M…h…` per run — the
 * same shape `qrcode`'s own SVG renderer emits, but as JSX, so its colour is
 * the card's `currentColor` rather than a hex baked into a string.
 */
function QrCode({ text, label }: { text: string; label: string }) {
  // `M` recovers from ~15% damage — a scratched phone screen, a thumb over a
  // corner — and keeps the matrix small enough to scan at arm's length.
  const { modules } = createQr(text, { errorCorrectionLevel: 'M' });
  const margin = 2;
  const size = modules.size + margin * 2;
  let path = '';
  for (let row = 0; row < modules.size; row += 1) {
    let col = 0;
    while (col < modules.size) {
      if (!modules.get(row, col)) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < modules.size && modules.get(row, col)) col += 1;
      path += `M${start + margin} ${row + margin + 0.5}h${col - start}`;
    }
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="ctr-id__qr"
    >
      <path d={path} stroke="currentColor" strokeWidth={1} fill="none" />
    </svg>
  );
}

/**
 * Two CSS pixels per module, set as the SVG's own width. A reader measures
 * bars against each other, and a module that renders 2px here and 3px there —
 * what a fluid width does to `crispEdges` — is a wide bar read as a narrow
 * one. `ST` plus a four-digit number is 121 modules, 242px: inside a 360px
 * phone with the card's margins.
 */
const MODULE_PX = 2;

function Barcode({ text, label }: { text: string; label: string }) {
  const { bars, width } = code128Bars(text);
  const height = 40;
  const d = bars.map((bar) => `M${bar.x} 0h${bar.width}v${height}h-${bar.width}z`).join('');

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width={width * MODULE_PX}
      // The height follows the CSS box: bars only need to be tall enough to
      // hit, so the vertical axis is free to stretch.
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className="ctr-id__bars"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}
