import { scheduleFor } from './lesson.service';

/**
 * The rule that keeps the schedule and the publish switch from disagreeing.
 * `undefined` and `null` mean different things to Prisma here — omit versus
 * clear — so both are asserted explicitly rather than through a truthiness
 * check that would let one stand in for the other.
 */
describe('scheduleFor', () => {
  it('cancels the schedule when the lecture is published by hand', () => {
    // Otherwise the sweeper later finds a row that is "due", publishes what is
    // already published, and writes an audit entry for a change nobody made.
    expect(scheduleFor(true, '2026-09-12T17:00:00.000Z')).toBeNull();
  });

  it('cancels it even when no schedule was sent in the same request', () => {
    expect(scheduleFor(true, undefined)).toBeNull();
  });

  it('leaves the schedule alone when neither field was sent', () => {
    // A PATCH that only renames a lecture must not touch its schedule, and
    // `undefined` is the only value Prisma reads as "do not write this column".
    expect(scheduleFor(undefined, undefined)).toBeUndefined();
  });

  it('does not invent a schedule when a lecture is unpublished', () => {
    expect(scheduleFor(false, undefined)).toBeUndefined();
  });

  it('clears the schedule on an explicit null', () => {
    // This is how «إلغاء الموعد» reaches the database — a write, not an omission.
    expect(scheduleFor(undefined, null)).toBeNull();
  });

  it('stores the instant the client named, not a re-read of the wall clock', () => {
    const result = scheduleFor(false, '2026-09-12T17:00:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe('2026-09-12T17:00:00.000Z');
  });

  it('keeps a non-UTC offset pointing at the same moment', () => {
    // 20:00 in Cairo (UTC+3) is 17:00Z. The offset is the whole reason the
    // column is `timestamptz` and the client sends an instant — see `toInstant`
    // in `lesson-settings-form.tsx`.
    const result = scheduleFor(false, '2026-09-12T20:00:00.000+03:00');
    expect((result as Date).toISOString()).toBe('2026-09-12T17:00:00.000Z');
  });
});
