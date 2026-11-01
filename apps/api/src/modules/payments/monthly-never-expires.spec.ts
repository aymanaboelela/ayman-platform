import { monthlyNeverExpires } from './payments.service';

/**
 * `payments.monthlyNeverExpires`: a monthly course-wide purchase writes no end
 * date when the flag is on. Only the monthly plan — quarterly and yearly keep
 * their dates — and a stack that never wrote the row reads as off.
 */
describe('monthlyNeverExpires', () => {
  const db = (enabled: boolean | null) =>
    ({
      featureFlag: { findUnique: jest.fn(async () => (enabled === null ? null : { enabled })) },
    }) as never;

  it('is on for a monthly purchase when the flag is on', async () => {
    await expect(monthlyNeverExpires(db(true), 'monthly')).resolves.toBe(true);
  });

  it('leaves quarterly and yearly dated even with the flag on', async () => {
    await expect(monthlyNeverExpires(db(true), 'quarterly')).resolves.toBe(false);
    await expect(monthlyNeverExpires(db(true), 'yearly')).resolves.toBe(false);
  });

  it('is off when the flag is off or was never written', async () => {
    await expect(monthlyNeverExpires(db(false), 'monthly')).resolves.toBe(false);
    await expect(monthlyNeverExpires(db(null), 'monthly')).resolves.toBe(false);
  });
});
