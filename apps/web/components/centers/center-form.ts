import type { CenterView } from '@ayman/contracts/centers';
import type { Onboarding } from '@ayman/contracts/onboarding';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { ApiRequestError } from '@/lib/api';

/**
 * The rules «نوع الدراسة» / «نوع الحضور» / the slot share between the wizard
 * and «بياناتك».
 *
 * ## Why the forms check these by hand
 *
 * `OnboardingSchema` has all three as OPTIONAL — an older client must still be
 * able to save — so the resolver never asks for them. And its «سنتر needs a
 * slot» refinement only runs once every OTHER field parses, which on the
 * wizard's step 3 is never: the guardian's number on step 4 is still empty. So
 * a step gate that relied on the schema would wave a missing slot through,
 * and the refusal would surface on the last step, under a question that is no
 * longer on screen.
 */

const c = copy.centers;

export type CenterFieldName = 'studyType' | 'attendanceMode' | 'centerSlotId';

/**
 * The slots a student can pick from, per centre, for `year`.
 *
 * `/api/centers` narrows by the STORED year, and during onboarding there is
 * none yet, so every slot comes back — the year chosen on the same step is
 * applied here. A slot with no year is open to all.
 */
export function slotsForYear(centers: readonly CenterView[], year: number | undefined): CenterView[] {
  return centers
    .map((center) => ({
      ...center,
      slots: center.slots.filter((slot) => year === undefined || slot.year === null || slot.year === year),
    }))
    .filter((center) => center.slots.length > 0);
}

/** Whether `slotId` can be sent: on screen, and either open or already the
 *  student's own (the service lets a student keep a seat in a full slot). */
export function isPickable(centers: readonly CenterView[], slotId: string | null | undefined, currentSlotId?: string | null): boolean {
  if (!slotId) return false;
  return centers.some((center) =>
    center.slots.some((slot) => slot.id === slotId && (!slot.full || slot.id === currentSlotId)),
  );
}

/**
 * What is missing, as `field → message`. `attendanceVisible` is false when the
 * question is not on screen (no centre on this stack, or the list has not
 * arrived) — nothing can be demanded of a question nobody was shown.
 */
export function centerFieldErrors(
  values: Pick<Partial<Onboarding>, CenterFieldName>,
  options: { attendanceVisible: boolean; slots: readonly CenterView[]; currentSlotId?: string | null },
): Partial<Record<CenterFieldName, string>> {
  const errors: Partial<Record<CenterFieldName, string>> = {};
  if (!values.studyType) errors.studyType = c.studyTypeError;
  if (!options.attendanceVisible) return errors;
  if (!values.attendanceMode) errors.attendanceMode = c.attendanceError;
  else if (
    values.attendanceMode === 'center' &&
    !isPickable(options.slots, values.centerSlotId, options.currentSlotId)
  ) {
    errors.centerSlotId = c.slotError;
  }
  return errors;
}

/**
 * The attendance half of the PATCH body. Spread AFTER the form's own values,
 * so it replaces whatever they hold.
 *
 * Hidden question, two policies:
 *   · `online` — the wizard. A stack with no centre is an online stack, and a
 *     new profile says so.
 *   · `keep` — «بياناتك». Both keys go out as `undefined`, which
 *     `JSON.stringify` drops, and the API keeps what is stored. A student with
 *     a seat whose list failed to load must not lose it for saving their name.
 */
export function attendancePayload(
  values: Pick<Partial<Onboarding>, 'attendanceMode' | 'centerSlotId'>,
  options: { attendanceVisible: boolean; whenHidden: 'online' | 'keep' },
): Pick<Partial<Onboarding>, 'attendanceMode' | 'centerSlotId'> {
  if (!options.attendanceVisible) {
    return options.whenHidden === 'online'
      ? { attendanceMode: 'online', centerSlotId: null }
      : { attendanceMode: undefined, centerSlotId: undefined };
  }
  return values.attendanceMode === 'center'
    ? { attendanceMode: 'center', centerSlotId: values.centerSlotId ?? null }
    : { attendanceMode: 'online', centerSlotId: null };
}

/**
 * A refusal of the SLOT, as the sentence to show under it — or `null` when the
 * error is about something else (the phone's 409 shares the status).
 */
export function slotRefusal(error: unknown): string | null {
  if (!(error instanceof ApiRequestError)) return null;
  const code = (error.payload as { code?: unknown } | undefined)?.code;
  switch (code) {
    case 'center_slot_full':
      return c.slotFullError;
    case 'center_slot_not_found':
      return c.slotGoneError;
    case 'center_slot_other_year':
      return c.slotOtherYearError;
    default:
      return null;
  }
}

/** «فاضل ٣ أماكن» — Arabic counts 1, 2, 3–10 and 11+ differently. */
export function seatsLeftLabel(seats: number): string {
  if (seats === 1) return c.seatsOne;
  if (seats === 2) return c.seatsTwo;
  return formatCopy(seats <= 10 ? c.seatsFew : c.seatsMany, { n: seats });
}

/** Whole pounds with Western digits, the platform's convention for money. */
const pounds = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 2 });

export function slotPriceLabel(priceCents: number): string {
  return formatCopy(c.slotPrice, { price: pounds.format(priceCents / 100) });
}
