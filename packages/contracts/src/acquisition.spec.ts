import { describe, expect, it } from 'vitest';
import { AcquisitionClaimSchema } from './acquisition';
import {
  ACQUISITION_FBCLID_MAX,
  ACQUISITION_VALUE_MAX,
  cleanAcquisitionToken,
  cleanAcquisitionValue,
} from './acquisition-touch';

/**
 * The claim is the one place a stranger's strings enter the database, so what
 * is asserted here is what comes OUT of the schema — the values the service
 * would write — not that a rule exists.
 */

const TOUCH = {
  source: 'facebook',
  medium: 'paid',
  campaign: 'y2-languages-lesson10-reel',
  content: null,
  term: null,
  fbclid: null,
  landingPath: '/courses/y2',
  ageSeconds: 120,
};

describe('cleanAcquisitionValue', () => {
  it('turns control characters into spaces and collapses the runs', () => {
    expect(cleanAcquisitionValue('a\r\nb\tc\u0000\u0085d', 50)).toBe('a b c d');
  });

  it('is null for nothing, blank, and anything that is not a string', () => {
    expect(cleanAcquisitionValue('', 50)).toBeNull();
    expect(cleanAcquisitionValue(' \n\t ', 50)).toBeNull();
    expect(cleanAcquisitionValue(null, 50)).toBeNull();
    expect(cleanAcquisitionValue(undefined, 50)).toBeNull();
  });

  it('caps what is kept, after cleaning', () => {
    expect(cleanAcquisitionValue(`  ${'x'.repeat(500)}`, 10)).toBe('x'.repeat(10));
  });

  it('keeps an Arabic campaign name as it was typed', () => {
    expect(cleanAcquisitionValue('ريل الدرس العاشر', 50)).toBe('ريل الدرس العاشر');
  });

  it('folds a source to lower case so one platform is one row', () => {
    expect(cleanAcquisitionToken(' FaceBook ')).toBe('facebook');
  });
});

describe('AcquisitionClaimSchema', () => {
  it('hands the service cleaned values', () => {
    const parsed = AcquisitionClaimSchema.parse({
      ...TOUCH,
      source: ' Facebook ',
      medium: 'PAID',
      campaign: 'Lesson\n10',
      term: '   ',
    });

    expect(parsed).toMatchObject({ source: 'facebook', medium: 'paid', campaign: 'Lesson 10', term: null });
  });

  it('refuses a touch that names no source at all', () => {
    const empty = { ...TOUCH, source: null, medium: null, campaign: null };

    expect(AcquisitionClaimSchema.safeParse(empty).success).toBe(false);
    // …including one whose only values clean away to nothing.
    expect(AcquisitionClaimSchema.safeParse({ ...empty, source: ' \n ' }).success).toBe(false);
  });

  it('accepts a click that carried only fbclid', () => {
    const fbOnly = { ...TOUCH, source: null, medium: null, campaign: null, fbclid: 'IwAR0abc' };

    expect(AcquisitionClaimSchema.safeParse(fbOnly).success).toBe(true);
  });

  it('refuses an oversized value instead of quietly trimming it', () => {
    expect(
      AcquisitionClaimSchema.safeParse({ ...TOUCH, campaign: 'x'.repeat(ACQUISITION_VALUE_MAX + 1) }).success,
    ).toBe(false);
    expect(
      AcquisitionClaimSchema.safeParse({ ...TOUCH, fbclid: 'x'.repeat(ACQUISITION_FBCLID_MAX + 1) }).success,
    ).toBe(false);
  });

  it('has nowhere to name an account or a time of its own', () => {
    // The account is the session's, and the touch's moment is derived from
    // the age — a body carrying either is not one this browser code wrote.
    expect(AcquisitionClaimSchema.safeParse({ ...TOUCH, userId: 'someone-else' }).success).toBe(false);
    expect(AcquisitionClaimSchema.safeParse({ ...TOUCH, firstTouchAt: '2020-01-01T00:00:00Z' }).success).toBe(false);
  });

  it('refuses a negative or fractional age', () => {
    expect(AcquisitionClaimSchema.safeParse({ ...TOUCH, ageSeconds: -1 }).success).toBe(false);
    expect(AcquisitionClaimSchema.safeParse({ ...TOUCH, ageSeconds: 1.5 }).success).toBe(false);
  });
});
