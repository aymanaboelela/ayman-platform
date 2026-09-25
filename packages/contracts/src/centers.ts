import { z } from '@ayman/contracts/zod';

/**
 * «السناتر» — the student's half: what centres and weekly slots exist, which
 * one this student booked, and how a slot is written out.
 *
 * The admin's half is `./admin/centers`. A stack with no active centre returns
 * an empty list here, and every screen that asks «أونلاين ولا سنتر» hides the
 * question — the feature appears by data, not by a flag.
 */

/** «نوع الدراسة» — ثانوي عام أو أزهري. Not `SchoolStreamSchema` (عربي/لغات). */
export const StudyTypeSchema = z.enum(['general', 'azhari']);
export type StudyType = z.infer<typeof StudyTypeSchema>;

/** «نوع الحضور». `center` means the student also books a slot. */
export const AttendanceModeSchema = z.enum(['online', 'center']);
export type AttendanceMode = z.infer<typeof AttendanceModeSchema>;

/** ٠ = الأحد … ٦ = السبت (Cairo). */
export const DayOfWeekSchema = z.number().int().min(0).max(6);

export const CenterSlotViewSchema = z.object({
  id: z.uuid(),
  label: z.string().nullable(),
  dayOfWeek: DayOfWeekSchema,
  startMinute: z.number().int(),
  endMinute: z.number().int(),
  year: z.number().int().nullable(),
  /** Closed to NEW bookings — the admin's «فل» switch, or no seat left. A
   *  student already booked here keeps it. */
  full: z.boolean(),
  /** Seats left, when the slot has a capacity; `null` = unlimited. */
  seatsLeft: z.number().int().nullable(),
  priceCents: z.number().int().nullable(),
});
export type CenterSlotView = z.infer<typeof CenterSlotViewSchema>;

export const CenterViewSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  mapUrl: z.string().nullable(),
  slots: z.array(CenterSlotViewSchema),
});
export type CenterView = z.infer<typeof CenterViewSchema>;

/** `GET /api/centers` — active centres with their active slots. */
export const CentersListSchema = z.object({ centers: z.array(CenterViewSchema) });
export type CentersList = z.infer<typeof CentersListSchema>;

/** `GET /api/me/center-booking` — the one live booking, or `null`. */
export const MyCenterBookingSchema = z.object({
  booking: z
    .object({
      slotId: z.uuid(),
      centerId: z.uuid(),
      centerName: z.string(),
      slot: CenterSlotViewSchema,
      bookedAt: z.iso.datetime(),
    })
    .nullable(),
  /** The student's short number — what the barcode on their profile encodes. */
  studentNumber: z.number().int(),
});
export type MyCenterBooking = z.infer<typeof MyCenterBookingSchema>;

/* ── formatting, shared by every screen that prints a slot ─────────────────── */

export const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

/** `840` → «2:00 م». Western digits, like every time on the platform. */
export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  const suffix = hours < 12 ? 'ص' : 'م';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** «السبت · 2:00 م – 4:00 م». */
export function formatSlotTime(slot: Pick<CenterSlotView, 'dayOfWeek' | 'startMinute' | 'endMinute'>): string {
  return `${DAY_NAMES_AR[slot.dayOfWeek]} · ${formatMinute(slot.startMinute)} – ${formatMinute(slot.endMinute)}`;
}

/**
 * The payload the barcode and the QR carry: the student number, prefixed so a
 * scanner pointed at some OTHER QR code (a WhatsApp group, a URL) is refused
 * instead of read as a number.
 */
export const ATTENDANCE_CODE_PREFIX = 'ST';
export function attendanceCodeFor(studentNumber: number): string {
  return `${ATTENDANCE_CODE_PREFIX}${studentNumber}`;
}
/** What the scanner read → the student number, or `null` for anything else.
 *  Accepts the bare number too — a USB barcode scanner or a hand-typed ID. */
export function studentNumberFromCode(raw: string): number | null {
  const match = /^\s*(?:ST)?(\d{3,9})\s*$/i.exec(raw);
  return match ? Number(match[1]) : null;
}
