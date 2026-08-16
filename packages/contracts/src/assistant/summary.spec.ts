import { describe, expect, it } from 'vitest';
import { parseAdminUnreadCount, parseMyConversationSummary } from './summary';

/**
 * The one contract in this package that no schema validates, so it is the one
 * whose validation has to be tested rather than trusted.
 *
 * Everywhere else `z.parse` is the thing under test and it is not ours; here
 * the four lines of narrowing ARE the contract, and they sit on the path every
 * page load takes. What follows is not shape assertion for its own sake — each
 * case is a way the launcher could start lying about a waiting reply.
 */
describe('parseMyConversationSummary', () => {
  const valid = { unread: 2, hasThread: true, hasOpenThread: true, isSignedIn: false };

  it('accepts the shape the endpoint sends', () => {
    expect(parseMyConversationSummary(valid)).toEqual(valid);
  });

  it('accepts the ordinary "never wrote to us" answer', () => {
    const none = { unread: 0, hasThread: false, hasOpenThread: false, isSignedIn: true };
    expect(parseMyConversationSummary(none)).toEqual(none);
  });

  it('keeps only the four fields it declares', () => {
    // A field the server grows later must not become widget state by accident
    // — the widget reads this object directly and nothing else re-narrows it.
    const parsed = parseMyConversationSummary({ ...valid, guestPhone: '+201000000001' });
    expect(Object.keys(parsed).sort()).toEqual([
      'hasOpenThread',
      'hasThread',
      'isSignedIn',
      'unread',
    ]);
  });

  it.each([
    ['a missing field', { unread: 1, hasThread: true, isSignedIn: false }],
    ['a stringified count', { ...valid, unread: '2' }],
    ['a fractional count', { ...valid, unread: 1.5 }],
    ['a negative count', { ...valid, unread: -1 }],
    ['a truthy string where a boolean belongs', { ...valid, hasThread: 'yes' }],
    ['null', null],
    ['an array', []],
    ['a bare number', 3],
  ])('throws on %s', (_case, input) => {
    /*
     * Throwing is the point. The widget's `catch` turns this into "no dot",
     * which is the same thing an unreachable API means — whereas a tolerant
     * parser would hand the launcher `undefined` and quietly stop telling
     * students their question was answered.
     */
    expect(() => parseMyConversationSummary(input)).toThrow(TypeError);
  });

  it('does not accept `unread` as a boolean in disguise', () => {
    // `true` coerces to 1 under `Number()`. It must not survive a check that
    // is supposed to prove the server sent a count.
    expect(() => parseMyConversationSummary({ ...valid, unread: true })).toThrow(TypeError);
  });
});

/**
 * The instructor's side of the same idea. It guards the sidebar badge, which
 * is the ONE number telling him somebody is waiting — a parser that let a
 * string or a `NaN` through would render a badge that reads «NaN» on every
 * admin screen, or worse, silently stop counting.
 */
describe('parseAdminUnreadCount', () => {
  it('returns the count', () => {
    expect(parseAdminUnreadCount({ unread: 0 })).toBe(0);
    expect(parseAdminUnreadCount({ unread: 7 })).toBe(7);
  });

  it('ignores anything else the response carries', () => {
    expect(parseAdminUnreadCount({ unread: 2, rows: [{}], total: 99 })).toBe(2);
  });

  it.each([
    ['a stringified count', { unread: '3' }],
    ['a fractional count', { unread: 1.5 }],
    ['a negative count', { unread: -1 }],
    ['a boolean in disguise', { unread: true }],
    ['a missing field', {}],
    ['null', null],
    ['an array', []],
    ['a bare number', 3],
  ])('throws on %s', (_case, input) => {
    expect(() => parseAdminUnreadCount(input)).toThrow(TypeError);
  });
});
