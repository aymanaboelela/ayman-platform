import { describe, expect, it } from 'vitest';
import { DEFAULT_PACING, cairoParts, fromCairoWall, nextSend } from '@ayman/contracts/marketing/pacing';
import {
  WA_CONTACTS_PACING,
  WA_CONTACTS_TRIAL,
  WaContactsStartSchema,
  runLimitReached,
  waitUntil,
} from '@ayman/contracts/marketing/wa-contacts';

const fresh = { sentInBatch: 0, sentToday: 0, dayKey: null };

describe('waitUntil', () => {
  it('is null inside the window with the cap unspent', () => {
    const noon = fromCairoWall(2026, 11, 3, 12);
    expect(waitUntil(noon, WA_CONTACTS_PACING, fresh)).toBeNull();
  });

  it('before the window → this morning at ten, Cairo', () => {
    const early = fromCairoWall(2026, 11, 3, 6, 30);
    expect(waitUntil(early, WA_CONTACTS_PACING, fresh)).toEqual(fromCairoWall(2026, 11, 3, 10));
  });

  it('after the window → tomorrow at ten, never three in the morning', () => {
    const late = fromCairoWall(2026, 11, 3, 23, 15);
    expect(waitUntil(late, WA_CONTACTS_PACING, fresh)).toEqual(fromCairoWall(2026, 11, 4, 10));
  });

  it("today's cap spent → tomorrow's opening, even at noon", () => {
    const noon = fromCairoWall(2026, 11, 3, 12);
    const spent = { sentInBatch: 3, sentToday: WA_CONTACTS_PACING.dailyCap, dayKey: cairoParts(noon).day };
    expect(waitUntil(noon, WA_CONTACTS_PACING, spent)).toEqual(fromCairoWall(2026, 11, 4, 10));
  });

  it("yesterday's count does not hold today back", () => {
    const noon = fromCairoWall(2026, 11, 3, 12);
    const yesterday = { sentInBatch: 0, sentToday: WA_CONTACTS_PACING.dailyCap, dayKey: '2026-11-02' };
    expect(waitUntil(noon, WA_CONTACTS_PACING, yesterday)).toBeNull();
  });
});

describe('the contacts pacing', () => {
  it('is no faster than a campaign anywhere it matters', () => {
    // Contacts send nothing, so they may be a little quicker between items —
    // but never in a way that adds up to more traffic in a day than the
    // gentlest thing the number already does.
    expect(WA_CONTACTS_PACING.minDelaySeconds).toBeGreaterThanOrEqual(30);
    expect(WA_CONTACTS_PACING.batchSize).toBeLessThanOrEqual(DEFAULT_PACING.batchSize);
    expect(WA_CONTACTS_PACING.batchPauseMinutes).toBeGreaterThanOrEqual(DEFAULT_PACING.batchPauseMinutes);
    expect(WA_CONTACTS_PACING.dailyCap).toBeLessThanOrEqual(200);
    expect(WA_CONTACTS_PACING.windowStartHour).toBeGreaterThanOrEqual(DEFAULT_PACING.windowStartHour);
    expect(WA_CONTACTS_PACING.windowEndHour).toBeLessThanOrEqual(DEFAULT_PACING.windowEndHour);
  });

  it('a twentieth save in a row earns the long pause', () => {
    const noon = fromCairoWall(2026, 11, 3, 12);
    const next = nextSend(noon, WA_CONTACTS_PACING, { sentInBatch: 19, sentToday: 19, dayKey: cairoParts(noon).day }, 0);
    expect(next.reason).toBe('batch-pause');
    expect(next.at.getTime() - noon.getTime()).toBe(15 * 60_000);
  });

  it('the trial is small', () => {
    expect(WA_CONTACTS_TRIAL).toBeLessThanOrEqual(10);
  });
});

describe('runLimitReached', () => {
  it('a trial stops at its limit; the whole list never does', () => {
    expect(runLimitReached(5, 4)).toBe(false);
    expect(runLimitReached(5, 5)).toBe(true);
    expect(runLimitReached(null, 10_000)).toBe(false);
  });
});

describe('WaContactsStartSchema', () => {
  it('takes a limit or null, and nothing else', () => {
    expect(WaContactsStartSchema.parse({ limit: 5 })).toEqual({ limit: 5 });
    expect(WaContactsStartSchema.parse({ limit: null })).toEqual({ limit: null });
    expect(() => WaContactsStartSchema.parse({ limit: 0 })).toThrow();
    expect(() => WaContactsStartSchema.parse({ limit: 5, force: true })).toThrow();
  });
});
