import { describe, expect, it } from 'vitest';
import { subscriptionExpiryLabel } from './subscription-expiry';

describe('subscriptionExpiryLabel', () => {
  const now = new Date('2026-06-15T10:00:00.000Z');

  it('renders nothing for a course with no subscription at all', () => {
    expect(subscriptionExpiryLabel(null, now)).toBeNull();
  });

  it('renders nothing once the subscription has already lapsed', () => {
    expect(subscriptionExpiryLabel('2026-06-14T00:00:00.000Z', now)).toBeNull();
  });

  it('says "today" when it expires within the same day', () => {
    expect(subscriptionExpiryLabel('2026-06-15T18:00:00.000Z', now)).toBe('الاشتراك بينتهي النهارده');
  });

  it('counts down in days inside the seven-day window', () => {
    // A little under three days out — rounds UP, so "٣ يوم" rather than
    // undercounting the last partial day.
    expect(subscriptionExpiryLabel('2026-06-18T04:00:00.000Z', now)).toBe(
      'باقي 3 يوم على انتهاء الاشتراك',
    );
  });

  it('switches to an absolute date once it is more than a week out', () => {
    const label = subscriptionExpiryLabel('2026-07-20T00:00:00.000Z', now);
    expect(label).toContain('الاشتراك بينتهي في');
    expect(label).not.toContain('باقي');
  });

  it('is exactly on the seven/eight day boundary as a countdown, not a date', () => {
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(subscriptionExpiryLabel(sevenDaysOut, now)).toContain('باقي');
  });
});
