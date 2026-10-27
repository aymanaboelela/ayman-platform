import { OutreachSettingsSchema } from '@ayman/contracts/admin/settings';
import {
  CHECKOUT_WINDOW_MS,
  DAY_MS,
  HOUR_MS,
  PAID_ACCESS_SCOPES,
  bookCheckoutAbandoned,
  cairoDayStart,
  checkoutDedupeKey,
  checkoutDue,
  checkoutScanBounds,
  checkoutWaitsForSignup,
  courseCheckoutAbandoned,
  gapAfter,
  inSendingWindow,
  intentIdOfDedupeKey,
  neverSubscribedWhere,
  secondNudgeBounds,
  sendGate,
  signupScanBounds,
  signupYieldsToCheckout,
} from './auto-outreach.rules';

/**
 * The rules that decide whether a WhatsApp message goes out from the
 * instructor's own number with nobody watching. Each case is a way this
 * feature could embarrass him: a reminder about a checkout that was paid, a
 * burst on a newly linked number, a 3am message, a welcome to someone whose
 * transfer is in the queue.
 */

const SETTINGS = OutreachSettingsSchema.parse({});
/** 14:00 Cairo on an ordinary October day (UTC+3 in summer time). */
const NOON = new Date('2026-10-20T11:00:00Z');
const ago = (ms: number) => new Date(NOON.getTime() - ms);

describe('the settings defaults the owner asked for', () => {
  it('is ON, at three hours, once a week per target, with a second nudge at four days', () => {
    expect(SETTINGS.checkoutRecovery).toBe(true);
    expect(SETTINGS.checkoutRecoveryAfterHours).toBe(3);
    expect(SETTINGS.checkoutRecoveryEveryDays).toBe(7);
    expect(SETTINGS.signupNudge).toBe(true);
    expect(SETTINGS.signupNudgeAfterHours).toBe(24);
    expect(SETTINGS.signupNudgeSecondAfterDays).toBe(4);
  });

  it('parses a row stored before these keys existed', () => {
    const old = { quizResult: false, maxPerStudentPerDay: 3 };
    expect(OutreachSettingsSchema.parse(old)).toMatchObject({ quizResult: false, checkoutRecovery: true });
  });
});

describe('checkoutDue — timing', () => {
  it('waits out the delay', () => {
    expect(checkoutDue({ openedAt: ago(2 * HOUR_MS), remindedAt: null }, NOON, SETTINGS)).toBe(false);
    expect(checkoutDue({ openedAt: ago(3 * HOUR_MS), remindedAt: null }, NOON, SETTINGS)).toBe(true);
  });

  it('never writes about a checkout older than two days — the cold-start rule', () => {
    expect(checkoutDue({ openedAt: ago(CHECKOUT_WINDOW_MS - 1000), remindedAt: null }, NOON, SETTINGS)).toBe(true);
    expect(checkoutDue({ openedAt: ago(CHECKOUT_WINDOW_MS + 1000), remindedAt: null }, NOON, SETTINGS)).toBe(false);
  });

  it('reminds about one opening once', () => {
    const openedAt = ago(5 * HOUR_MS);
    expect(checkoutDue({ openedAt, remindedAt: ago(1 * HOUR_MS) }, NOON, SETTINGS)).toBe(false);
  });

  it('reminds about a reopened checkout again, but only after the configured days', () => {
    // Reminded nine days ago, reopened four hours ago.
    expect(checkoutDue({ openedAt: ago(4 * HOUR_MS), remindedAt: ago(9 * DAY_MS) }, NOON, SETTINGS)).toBe(true);
    // Reminded two days ago, reopened four hours ago — too soon.
    expect(checkoutDue({ openedAt: ago(4 * HOUR_MS), remindedAt: ago(2 * DAY_MS) }, NOON, SETTINGS)).toBe(false);
  });

  it('scans exactly the band checkoutDue accepts', () => {
    const { from, to } = checkoutScanBounds(NOON, SETTINGS);
    expect(NOON.getTime() - from.getTime()).toBe(CHECKOUT_WINDOW_MS);
    expect(NOON.getTime() - to.getTime()).toBe(3 * HOUR_MS);
  });
});

describe('checkout abandoned — was it actually left?', () => {
  const open = {
    stillOnSale: true,
    pendingSubmission: false,
    approvedSinceOpened: false,
    grantSinceOpened: false,
  };

  it('is abandoned with nothing paid', () => {
    expect(courseCheckoutAbandoned(open)).toBe(true);
  });

  it.each([
    ['a transfer waiting for review', { pendingSubmission: true }],
    ['an approved payment since it was opened', { approvedSinceOpened: true }],
    ['a grant since it was opened (admin, code, wallet)', { grantSinceOpened: true }],
    ['a course no longer on sale', { stillOnSale: false }],
  ])('is NOT abandoned with %s', (_label, change) => {
    expect(courseCheckoutAbandoned({ ...open, ...change })).toBe(false);
  });

  it('treats a book order as abandoned only while live and unpaid', () => {
    expect(bookCheckoutAbandoned({ status: 'address_only', deletedAt: null })).toBe(true);
    expect(bookCheckoutAbandoned({ status: 'paid', deletedAt: null })).toBe(false);
    expect(bookCheckoutAbandoned({ status: 'address_only', deletedAt: new Date() })).toBe(false);
    expect(bookCheckoutAbandoned(null)).toBe(false);
  });

  it('keys the ledger on the opening, and reads the intent back out', () => {
    const intent = { id: '0199f000-0000-7000-8000-000000000001', openedAt: ago(HOUR_MS) };
    const key = checkoutDedupeKey(intent);
    expect(intentIdOfDedupeKey(key)).toBe(intent.id);
    expect(checkoutDedupeKey({ ...intent, openedAt: ago(2 * HOUR_MS) })).not.toBe(key);
  });
});

describe('signup nudge — who and when', () => {
  it('considers sign-ups from the last week that are past the delay, and nothing older', () => {
    const { from, to } = signupScanBounds(NOON, SETTINGS);
    expect(NOON.getTime() - from.getTime()).toBe(7 * DAY_MS);
    expect(NOON.getTime() - to.getTime()).toBe(24 * HOUR_MS);
  });

  it('turns the second nudge off at 0, and bounds it when on', () => {
    expect(secondNudgeBounds(NOON, { signupNudgeSecondAfterDays: 0 })).toBeNull();
    const bounds = secondNudgeBounds(NOON, { signupNudgeSecondAfterDays: 4 })!;
    expect(NOON.getTime() - bounds.to.getTime()).toBe(4 * DAY_MS);
    expect(bounds.to.getTime() - bounds.from.getTime()).toBe(3 * DAY_MS);
  });

  it('stands down for a student with an open checkout — the checkout reminder wins', () => {
    expect(
      signupYieldsToCheckout({ now: NOON, latestIntentOpenedAt: ago(5 * HOUR_MS), latestCheckoutReminderAt: null }),
    ).toBe(true);
    expect(
      signupYieldsToCheckout({ now: NOON, latestIntentOpenedAt: ago(10 * DAY_MS), latestCheckoutReminderAt: null }),
    ).toBe(false);
  });

  it('never lands on the same day as a checkout reminder, in either order', () => {
    expect(
      signupYieldsToCheckout({ now: NOON, latestIntentOpenedAt: null, latestCheckoutReminderAt: ago(6 * HOUR_MS) }),
    ).toBe(true);
    expect(checkoutWaitsForSignup(NOON, ago(6 * HOUR_MS))).toBe(true);
    expect(checkoutWaitsForSignup(NOON, ago(25 * HOUR_MS))).toBe(false);
    expect(checkoutWaitsForSignup(NOON, null)).toBe(false);
  });

  it('does not count the platform-wide grant every first enrollment creates', () => {
    expect(PAID_ACCESS_SCOPES).not.toContain('platform');
    const where = neverSubscribedWhere(NOON);
    expect(where.accessGrants?.none?.scope).toEqual({ in: [...PAID_ACCESS_SCOPES] });
    // A transfer in the review queue is a student who is subscribing.
    expect(where.paymentSubmissions).toEqual({ none: { status: 'pending' } });
  });
});

describe('the send gate — a new number must not burst', () => {
  const open = { now: NOON, sentToday: 0, dailyCap: 30, last: null };

  it('sends inside 10:00–22:00 Cairo only', () => {
    expect(inSendingWindow(new Date('2026-10-20T06:59:00Z'))).toBe(false); // 09:59 Cairo
    expect(inSendingWindow(new Date('2026-10-20T07:00:00Z'))).toBe(true); // 10:00
    expect(inSendingWindow(new Date('2026-10-20T18:59:00Z'))).toBe(true); // 21:59
    expect(inSendingWindow(new Date('2026-10-20T19:00:00Z'))).toBe(false); // 22:00
    expect(sendGate({ ...open, now: new Date('2026-10-20T00:30:00Z') })).toEqual({
      open: false,
      reason: 'outside-window',
    });
  });

  it('stops at the daily ceiling', () => {
    expect(sendGate({ ...open, sentToday: 29 })).toEqual({ open: true });
    expect(sendGate({ ...open, sentToday: 30 })).toEqual({ open: false, reason: 'daily-cap' });
  });

  it('spaces messages 90s–4m apart, with a gap that does not repeat', () => {
    const id = '0199f000-0000-7000-8000-00000000abcd';
    const gap = gapAfter(id);
    expect(gap).toBeGreaterThanOrEqual(90_000);
    expect(gap).toBeLessThan(240_000);
    expect(sendGate({ ...open, last: { id, at: new Date(NOON.getTime() - gap + 1000) } })).toEqual({
      open: false,
      reason: 'spacing',
    });
    expect(sendGate({ ...open, last: { id, at: new Date(NOON.getTime() - gap) } })).toEqual({ open: true });

    const gaps = new Set(Array.from({ length: 20 }, (_, i) => gapAfter(`${id}-${i}`)));
    expect(gaps.size).toBeGreaterThan(10);
  });

  it('counts the day from Cairo midnight, not UTC', () => {
    // 00:30 Cairo on the 20th is 21:30 UTC on the 19th.
    const start = cairoDayStart(new Date('2026-10-19T21:30:00Z'));
    expect(start.toISOString()).toBe('2026-10-19T21:00:00.000Z');
  });
});
