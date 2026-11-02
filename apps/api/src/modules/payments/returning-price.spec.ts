import { chargedPlanPriceCents, isReturningSubscriber, returningPlanPriceCents } from './returning-price';

let featureOn = true;
jest.mock('../../common/entitlements', () => ({ isFeatureEnabled: () => featureOn }));

/**
 * «سعر المشتركين القدام»: a student who paid for the course before the line
 * pays the returning price for a month or a term; everyone else — and every
 * plan without a returning price — pays the regular one.
 */
describe('returning price', () => {
  const before = new Date('2026-11-02T10:00:00Z');
  const course = {
    id: 'course-1',
    returningMonthlyPriceCents: 15000,
    returningPriceBefore: before,
    terms: [
      { id: 'term-1', returningPriceCents: 45000 },
      { id: 'term-2', returningPriceCents: null },
    ],
  };

  /** `paid`/`redeemed` answer the two lookups; the `where`s are kept to
   *  assert the line and the «not free, approved» rule are actually asked. */
  const db = (paid: boolean, redeemed = false) => {
    const client = {
      paymentSubmission: { findFirst: jest.fn(async () => (paid ? { id: 's' } : null)) },
      unlockCode: { findFirst: jest.fn(async () => (redeemed ? { id: 'c' } : null)) },
    };
    return client;
  };

  beforeEach(() => {
    featureOn = true;
  });

  it('counts an approved, paid submission made before the line', async () => {
    const client = db(true);
    await expect(isReturningSubscriber(client as never, 'u', course)).resolves.toBe(true);
    expect(client.paymentSubmission.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u', courseId: 'course-1', status: 'approved', isFree: false, createdAt: { lt: before } },
      select: { id: true },
    });
  });

  it('counts a centre code for the course redeemed before the line', async () => {
    const client = db(false, true);
    await expect(isReturningSubscriber(client as never, 'u', course)).resolves.toBe(true);
    expect(client.unlockCode.findFirst).toHaveBeenCalledWith({
      where: { redeemedByUserId: 'u', courseId: 'course-1', redeemedAt: { lt: before } },
      select: { id: true },
    });
  });

  it('is nobody when the course has no line, or the stack lacks the feature', async () => {
    const client = db(true);
    await expect(
      isReturningSubscriber(client as never, 'u', { ...course, returningPriceBefore: null }),
    ).resolves.toBe(false);
    featureOn = false;
    await expect(isReturningSubscriber(client as never, 'u', course)).resolves.toBe(false);
    expect(client.paymentSubmission.findFirst).not.toHaveBeenCalled();
  });

  it('prices only the month and the term twice', () => {
    expect(returningPlanPriceCents(course, 'monthly', null)).toBe(15000);
    expect(returningPlanPriceCents(course, 'term', 'term-1')).toBe(45000);
    expect(returningPlanPriceCents(course, 'term', 'term-2')).toBeNull();
    expect(returningPlanPriceCents(course, 'yearly', null)).toBeNull();
  });

  it('charges a returning student the returning price and a new one the regular', async () => {
    await expect(chargedPlanPriceCents(db(true) as never, 'u', course, 'monthly', null, 20000)).resolves.toBe(15000);
    await expect(chargedPlanPriceCents(db(false) as never, 'u', course, 'monthly', null, 20000)).resolves.toBe(20000);
    await expect(chargedPlanPriceCents(db(true) as never, 'u', course, 'term', 'term-1', 55000)).resolves.toBe(45000);
  });

  it('asks nothing for a plan with no returning price, and keeps a plan not sold unsold', async () => {
    const client = db(true);
    await expect(chargedPlanPriceCents(client as never, 'u', course, 'yearly', null, 95000)).resolves.toBe(95000);
    await expect(chargedPlanPriceCents(client as never, 'u', course, 'monthly', null, null)).resolves.toBeNull();
    expect(client.paymentSubmission.findFirst).not.toHaveBeenCalled();
  });
});
