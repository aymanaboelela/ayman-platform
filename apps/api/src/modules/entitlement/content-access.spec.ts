import { contentGrantOpening, contentSliceOf, type ContentScopedGrant } from './content-access';

const now = new Date('2026-09-25T12:00:00Z');
const grant = (over: Partial<ContentScopedGrant>): ContentScopedGrant => ({
  id: 'g',
  scope: 'lesson',
  sectionId: null,
  lessonId: null,
  validFrom: new Date('2026-09-01T00:00:00Z'),
  validUntil: null,
  revokedAt: null,
  ...over,
});

describe('content-access', () => {
  it('a lecture grant opens that lecture only', () => {
    const slice = contentSliceOf([grant({ id: 'g1', lessonId: 'L1' })], now);
    expect(contentGrantOpening(slice, { id: 'L1', sectionId: 'S1' })).toBe('g1');
    expect(contentGrantOpening(slice, { id: 'L2', sectionId: 'S1' })).toBeNull();
  });

  it('a unit grant opens every lecture in the unit', () => {
    const slice = contentSliceOf([grant({ id: 'g2', scope: 'section', sectionId: 'S1' })], now);
    expect(contentGrantOpening(slice, { id: 'L1', sectionId: 'S1' })).toBe('g2');
    expect(contentGrantOpening(slice, { id: 'L9', sectionId: 'S1' })).toBe('g2');
    expect(contentGrantOpening(slice, { id: 'L3', sectionId: 'S2' })).toBeNull();
  });

  it('the lecture\'s own grant is reported over its unit\'s', () => {
    const slice = contentSliceOf(
      [grant({ id: 'unit', scope: 'section', sectionId: 'S1' }), grant({ id: 'lecture', lessonId: 'L1' })],
      now,
    );
    expect(contentGrantOpening(slice, { id: 'L1', sectionId: 'S1' })).toBe('lecture');
  });

  it('a pulled code (revoked) or a future one opens nothing', () => {
    const slice = contentSliceOf(
      [
        grant({ id: 'r', lessonId: 'L1', revokedAt: new Date('2026-09-20T00:00:00Z') }),
        grant({ id: 'f', lessonId: 'L2', validFrom: new Date('2026-10-01T00:00:00Z') }),
      ],
      now,
    );
    expect(contentGrantOpening(slice, { id: 'L1', sectionId: 'S1' })).toBeNull();
    expect(contentGrantOpening(slice, { id: 'L2', sectionId: 'S1' })).toBeNull();
  });

  it('ignores scopes that are not content scopes', () => {
    const slice = contentSliceOf([grant({ id: 'c', scope: 'course', lessonId: 'L1' })], now);
    expect(contentGrantOpening(slice, { id: 'L1', sectionId: 'S1' })).toBeNull();
  });
});
