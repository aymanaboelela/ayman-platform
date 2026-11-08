import { describe, expect, it } from 'vitest';
import { CENTER_RESERVATION_PROOF_KEY_PATTERN, isValidStorageKey } from '@ayman/contracts/admin/media';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { ReservationCreateSchema, bookingAmountCents } from '@ayman/contracts/center-reservations';

describe('bookingAmountCents — «نص الحصة»', () => {
  it('takes the share and rounds to whole pounds', () => {
    expect(bookingAmountCents(15000, 50)).toBe(7500);
    expect(bookingAmountCents(14500, 50)).toBe(7300); // 72.5 → 73, never «٧٢٫٥٠»
    expect(bookingAmountCents(20000, 30)).toBe(6000);
  });

  it('is free with no price or a zero share', () => {
    expect(bookingAmountCents(null, 50)).toBe(0);
    expect(bookingAmountCents(0, 50)).toBe(0);
    expect(bookingAmountCents(15000, 0)).toBe(0);
  });
});

describe('the booking form', () => {
  it('normalises the phone the way sign-in does', () => {
    const parsed = ReservationCreateSchema.parse({
      centerId: '01a1b865-8f25-7343-a529-463daaee65ee',
      slotId: '01a1b865-8f25-7343-a529-463daaee65ef',
      fullName: 'سلمى أحمد عبد الله',
      phone: '01098765432',
      gradeSlug: 'bac2',
      track: 'languages',
      system: 'general',
      gender: 'female',
    });
    expect(parsed.phone).toBe('+201098765432');
  });
});

describe('the screenshot storage key', () => {
  it('is a valid private key, so the upload does not die at storage', () => {
    const key = 'center-reservation-proof/f7/f77881e4-4616-4ab8-aa90-c4b52df2dcda.webp';
    expect(CENTER_RESERVATION_PROOF_KEY_PATTERN.test(key)).toBe(true);
    expect(isValidStorageKey(key)).toBe(true);
  });
});

describe('the copy', () => {
  it('never says «عربون» — the owner asked for the session price instead', () => {
    expect(JSON.stringify(reservationsCopy)).not.toContain('عربون');
  });
});

describe('the door code', () => {
  it('round-trips RS + number and never reads a student card', async () => {
    const { reservationCodeFor, reservationNumberFromCode } = await import('@ayman/contracts/center-reservations');
    expect(reservationCodeFor(1024)).toBe('RS1024');
    expect(reservationNumberFromCode(' rs1024 ')).toBe(1024);
    expect(reservationNumberFromCode('ST1024')).toBeNull();
    expect(reservationNumberFromCode('1024')).toBeNull();
  });

  it('leaves the rest of the session for the door until the first attendance', async () => {
    const { remainingAtDoorCents } = await import('@ayman/contracts/center-reservations');
    expect(remainingAtDoorCents(12000, 6000, false)).toBe(6000);
    expect(remainingAtDoorCents(12000, 6000, true)).toBe(0);
    expect(remainingAtDoorCents(null, 0, false)).toBe(0);
  });
});
