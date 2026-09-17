import {
  courseAccessScopes,
  grantCoversCourse,
  grantLiveness,
  hasLiveCourseAccess,
  type ScopedGrant,
} from './grant-liveness';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const FREE_COURSE = { id: 'course-1', subjectId: 'subject-1', requiresGrant: false };
const CLOSED_COURSE = { id: 'course-1', subjectId: 'subject-1', requiresGrant: true };

function grant(over: Partial<ScopedGrant> = {}): ScopedGrant {
  return {
    scope: 'course',
    courseId: 'course-1',
    subjectId: null,
    validFrom: new Date(NOW.getTime() - HOUR),
    validUntil: null,
    revokedAt: null,
    ...over,
  };
}

describe('grantLiveness', () => {
  it('is live for an open-ended grant that has already started', () => {
    expect(grantLiveness(grant(), NOW)).toBe('live');
  });

  it('is live for a dated grant still inside its window', () => {
    expect(grantLiveness(grant({ validUntil: new Date(NOW.getTime() + HOUR) }), NOW)).toBe('live');
  });

  it('is expired once validUntil has passed', () => {
    expect(grantLiveness(grant({ validUntil: new Date(NOW.getTime() - HOUR) }), NOW)).toBe(
      'expired',
    );
  });

  it('is expired at exactly validUntil — the last instant is spent, not live', () => {
    expect(grantLiveness(grant({ validUntil: NOW }), NOW)).toBe('expired');
  });

  it('is not_yet_valid before validFrom', () => {
    expect(grantLiveness(grant({ validFrom: new Date(NOW.getTime() + HOUR) }), NOW)).toBe(
      'not_yet_valid',
    );
  });

  it('reports revoked ahead of expired — somebody acted, the date did not just pass', () => {
    // `TermService.setOpen` stamps `revokedAt` in bulk; that is the reason
    // the student is shown, even on a grant whose window also elapsed.
    const closed = grant({
      revokedAt: new Date(NOW.getTime() - HOUR),
      validUntil: new Date(NOW.getTime() - HOUR),
    });
    expect(grantLiveness(closed, NOW)).toBe('revoked');
  });
});

describe('courseAccessScopes', () => {
  it('lets the platform-wide grant satisfy a free course', () => {
    expect(courseAccessScopes(FREE_COURSE)).toContainEqual({ scope: 'platform' });
  });

  it('drops platform for a course that requires its own grant', () => {
    expect(courseAccessScopes(CLOSED_COURSE)).not.toContainEqual({ scope: 'platform' });
  });

  it('matches a term grant on courseId alone — "some access", not "which term"', () => {
    expect(courseAccessScopes(CLOSED_COURSE)).toContainEqual({
      scope: 'term',
      courseId: 'course-1',
    });
  });
});

describe('grantCoversCourse', () => {
  it('matches a subject_teacher grant on subjectId, not courseId', () => {
    const subjectGrant = grant({ scope: 'subject_teacher', courseId: null, subjectId: 'subject-1' });
    expect(grantCoversCourse(subjectGrant, FREE_COURSE)).toBe(true);
    expect(
      grantCoversCourse(subjectGrant, { ...FREE_COURSE, subjectId: 'subject-other' }),
    ).toBe(false);
  });

  it('does not let another course’s grant open this one', () => {
    expect(grantCoversCourse(grant({ courseId: 'course-other' }), FREE_COURSE)).toBe(false);
  });

  it('ignores a platform grant on a course that requires its own', () => {
    const platform = grant({ scope: 'platform', courseId: null });
    expect(grantCoversCourse(platform, FREE_COURSE)).toBe(true);
    expect(grantCoversCourse(platform, CLOSED_COURSE)).toBe(false);
  });
});

describe('hasLiveCourseAccess', () => {
  it('is false when the only covering grant was revoked — the term-close case', () => {
    const revoked = grant({ scope: 'term', revokedAt: new Date(NOW.getTime() - HOUR) });
    expect(hasLiveCourseAccess([revoked], CLOSED_COURSE, NOW)).toBe(false);
  });

  it('is false when the only covering grant has elapsed — the monthly case', () => {
    const lapsed = grant({ validUntil: new Date(NOW.getTime() - HOUR) });
    expect(hasLiveCourseAccess([lapsed], CLOSED_COURSE, NOW)).toBe(false);
  });

  it('is true when a renewal sits alongside the spent grant', () => {
    // What a student looks like the moment their payment is approved: the
    // old row is still there, revoked or elapsed, and the new one opens it.
    const lapsed = grant({ validUntil: new Date(NOW.getTime() - HOUR) });
    const renewed = grant({ validUntil: new Date(NOW.getTime() + 30 * 24 * HOUR) });
    expect(hasLiveCourseAccess([lapsed, renewed], CLOSED_COURSE, NOW)).toBe(true);
  });

  it('is false when a live grant covers a DIFFERENT course', () => {
    expect(
      hasLiveCourseAccess([grant({ courseId: 'course-other' })], CLOSED_COURSE, NOW),
    ).toBe(false);
  });

  it('is false with no grants at all', () => {
    expect(hasLiveCourseAccess([], CLOSED_COURSE, NOW)).toBe(false);
  });
});
