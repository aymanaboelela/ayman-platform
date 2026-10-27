import { describe, expect, it } from '@jest/globals';
import { accessFor, type AccessGrantRow } from './guardian-access';

const NOW = new Date('2026-10-20T12:00:00Z');
const COURSE = { id: 'c-1', subjectId: 's-1', requiresGrant: true };
const MONTHS = new Map([
  ['m-1', { title: 'شهر ١', index: 1 }],
  ['m-2', { title: 'شهر ٢', index: 2 }],
]);

let seq = 0;
function grant(over: Partial<AccessGrantRow>): AccessGrantRow {
  seq += 1;
  return {
    id: `g-${seq}`,
    scope: 'course',
    courseId: 'c-1',
    subjectId: null,
    monthId: null,
    validFrom: new Date('2026-09-01T00:00:00Z'),
    validUntil: null,
    revokedAt: null,
    ...over,
  };
}

/**
 * «الاشتراك» from the grants. The enrollment row never appears here, on
 * purpose: it says `active` for a lapsed student too.
 */
describe('accessFor', () => {
  it('reads an active subscription and its end date off the live grant', () => {
    const until = new Date('2026-12-31T00:00:00Z');
    expect(accessFor(COURSE, [grant({ validUntil: until })], MONTHS, NOW)).toEqual({
      state: 'active',
      plan: 'full',
      months: [],
      validUntil: until.toISOString(),
    });
  });

  it('a term closed by the teacher (revoked) is ended, whatever the enrollment says', () => {
    const access = accessFor(COURSE, [grant({ scope: 'term', revokedAt: new Date('2026-10-01T00:00:00Z') })], MONTHS, NOW);
    expect(access).toEqual({ state: 'ended', plan: null, months: [], validUntil: null });
  });

  it('an expired dated grant is ended', () => {
    expect(accessFor(COURSE, [grant({ validUntil: new Date('2026-10-19T00:00:00Z') })], MONTHS, NOW).state).toBe('ended');
  });

  it('names the months held, in curriculum order, and only the live ones', () => {
    const access = accessFor(
      COURSE,
      [
        grant({ scope: 'course_month', monthId: 'm-2' }),
        grant({ scope: 'course_month', monthId: 'm-1' }),
        grant({ scope: 'course_month', monthId: 'm-3', revokedAt: NOW }),
      ],
      MONTHS,
      NOW,
    );
    expect(access).toEqual({ state: 'active', plan: 'months', months: ['شهر ١', 'شهر ٢'], validUntil: null });
  });

  it('the widest plan wins — a term holder who also bought a month is on the term', () => {
    const access = accessFor(
      COURSE,
      [grant({ scope: 'course_month', monthId: 'm-1' }), grant({ scope: 'term' })],
      MONTHS,
      NOW,
    );
    expect(access).toMatchObject({ state: 'active', plan: 'term', months: [] });
  });

  it('a grant with no end date means the access has none', () => {
    const access = accessFor(
      COURSE,
      [grant({ validUntil: new Date('2026-11-01T00:00:00Z') }), grant({ validUntil: null })],
      MONTHS,
      NOW,
    );
    expect(access.validUntil).toBeNull();
  });

  it('a grant for ANOTHER course opens nothing here', () => {
    expect(accessFor(COURSE, [grant({ courseId: 'c-2' })], MONTHS, NOW).state).toBe('ended');
  });

  it('a student holding only unlock codes is on codes, not ended', () => {
    expect(accessFor(COURSE, [grant({ scope: 'lesson' })], MONTHS, NOW)).toEqual({
      state: 'codes',
      plan: null,
      months: [],
      validUntil: null,
    });
  });

  it('a free course is opened by the platform-wide grant', () => {
    const free = { ...COURSE, requiresGrant: false };
    expect(accessFor(free, [grant({ scope: 'platform', courseId: null })], MONTHS, NOW)).toMatchObject({
      state: 'active',
      plan: 'full',
    });
  });
});
