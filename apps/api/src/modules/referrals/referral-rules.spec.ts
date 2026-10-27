import { REFERRAL_CODE_PATTERN, encodeReferralCookie } from '@ayman/contracts/referrals';
import {
  cairoMonthStart,
  clickWithinWindow,
  friendStatusOf,
  generateReferralCode,
  realMoneyCovers,
  referralAbuse,
  referralClickFromCookieHeader,
  reversalTake,
  type PersonPhones,
} from './referral-rules';

/**
 * «دعوة الصحاب» — the rules that decide money, one at a time, with no
 * database. The service spec proves they are wired; this proves they say
 * what they claim.
 */

const person = (over: Partial<PersonPhones> = {}): PersonPhones => ({
  userId: 'u-a',
  bannedAt: null,
  own: ['+201011111111'],
  guardian: ['+201022222222'],
  ...over,
});

describe('share codes', () => {
  it('are six characters off the unambiguous alphabet', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generateReferralCode()).toMatch(REFERRAL_CODE_PATTERN);
    }
  });
});

describe('the click cookie', () => {
  const clickedAt = new Date('2026-10-01T10:00:00Z');

  it('reads the production cookie, and prefers it over the development one', () => {
    const header = `ref=${encodeReferralCookie('ZZZZZZ', clickedAt)}; __Host-ref=${encodeReferralCookie('ABC234', clickedAt)}`;
    expect(referralClickFromCookieHeader(header)).toEqual({ code: 'ABC234', clickedAt });
  });

  it('reads the development cookie when it is the only one', () => {
    expect(referralClickFromCookieHeader(`a=1; ref=${encodeReferralCookie('ABC234', clickedAt)}`)?.code).toBe('ABC234');
  });

  it('refuses anything that is not a code and a time', () => {
    for (const header of [null, '', 'ref=', 'ref=ABC234', 'ref=ABC0O1.1700000000', 'ref=ABC234.12x', 'ref=A.B.C']) {
      expect(referralClickFromCookieHeader(header)).toBeNull();
    }
  });

  it('counts a click inside the window and not after it', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    expect(clickWithinWindow(clickedAt, now, 30)).toBe(true);
    expect(clickWithinWindow(clickedAt, now, 14)).toBe(false);
    // A click stamped in the future is a hand-written cookie, not a click.
    expect(clickWithinWindow(new Date('2026-10-21T10:00:00Z'), now, 30)).toBe(false);
  });
});

describe('the abuse rules', () => {
  it('passes two different students from two different homes', () => {
    const referrer = person();
    const friend = person({ userId: 'u-b', own: ['01033333333'], guardian: ['01044444444'] });
    expect(referralAbuse(referrer, friend)).toBeNull();
  });

  it('refuses the same account', () => {
    expect(referralAbuse(person(), person())).toBe('self');
  });

  it('refuses the same phone, however it was typed', () => {
    const friend = person({ userId: 'u-b', own: ['01011111111'], guardian: [] });
    expect(referralAbuse(person(), friend)).toBe('same_phone');
  });

  it('refuses the same parent behind both students', () => {
    const friend = person({ userId: 'u-b', own: ['01033333333'], guardian: [null, '+20 102 222 2222'] });
    expect(referralAbuse(person(), friend)).toBe('guardian_phone');
  });

  it("refuses a friend whose own number is the referrer's parent's", () => {
    const friend = person({ userId: 'u-b', own: ['01022222222'], guardian: [] });
    expect(referralAbuse(person(), friend)).toBe('guardian_phone');
  });

  it('refuses a banned account on either side', () => {
    const friend = person({ userId: 'u-b', own: ['01033333333'], guardian: [], bannedAt: new Date() });
    expect(referralAbuse(person(), friend)).toBe('banned');
  });

  it('ignores blanks and numbers that are not Egyptian phones', () => {
    const referrer = person({ own: [null, ''], guardian: ['not a phone'] });
    const friend = person({ userId: 'u-b', own: [undefined], guardian: ['not a phone'] });
    expect(referralAbuse(referrer, friend)).toBeNull();
  });
});

describe('real money', () => {
  it('a wallet purchase counts when income covered every course bought so far', () => {
    expect(realMoneyCovers(30_000, 30_000)).toBe(true);
    expect(realMoneyCovers(50_000, 30_000)).toBe(true);
  });

  it('a wallet purchase that needed gift or reward money does not', () => {
    expect(realMoneyCovers(0, 30_000)).toBe(false);
    expect(realMoneyCovers(20_000, 30_000)).toBe(false);
  });
});

describe('reversals', () => {
  it('take the reward back, or whatever is left, never below zero', () => {
    expect(reversalTake(10_000, 5_000)).toBe(5_000);
    expect(reversalTake(2_000, 5_000)).toBe(2_000);
    expect(reversalTake(0, 5_000)).toBe(0);
  });
});

describe('the monthly cap boundary', () => {
  it('is midnight on the 1st in Cairo, not in UTC', () => {
    // 1 Nov 2026, 00:30 Cairo (winter, UTC+2) is still 31 Oct in UTC.
    const justAfter = new Date('2026-10-31T22:30:00Z');
    expect(cairoMonthStart(justAfter).toISOString()).toBe('2026-10-31T22:00:00.000Z');
    // Mid-month: the same boundary.
    expect(cairoMonthStart(new Date('2026-11-15T12:00:00Z')).toISOString()).toBe('2026-10-31T22:00:00.000Z');
  });
});

describe("the student's view", () => {
  it('never tells the student which abuse rule fired', () => {
    expect(friendStatusOf('blocked')).toBe('closed');
    expect(friendStatusOf('voided')).toBe('closed');
    expect(friendStatusOf('credited')).toBe('credited');
  });
});
