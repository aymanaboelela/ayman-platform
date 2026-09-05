import { describe, expect, it } from 'vitest';
import { BookOrderStatusSchema } from '@ayman/contracts/book-orders';
import { AudienceSchema, EMPTY_AUDIENCE } from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';

/**
 * The audience axis nobody can test through the API: what an OLD campaign row
 * parses to, and whether the picker has a word for every state it will render.
 *
 * `AudienceService`'s own spec covers the resolution — which students each
 * state selects, against the real database. These two are the failures that
 * spec cannot see: a `default()` that isn't there (the campaign detail screen
 * 500s on every campaign created before today) and a checkbox with no label
 * (`undefined` rendered next to a tick box, no error anywhere).
 */
describe('AudienceSchema — book order states', () => {
  /** Exactly what `campaigns.audience` holds for a row written before this
   *  field existed. Spelled out rather than derived from `EMPTY_AUDIENCE` so
   *  it stays what it is: a frozen snapshot of the old shape. */
  const LEGACY_AUDIENCE_JSON = {
    students: true,
    parents: false,
    years: [],
    schoolStreams: [],
    courseIds: [],
    notSubscribedOnly: false,
    extraPhones: [],
  };

  it('parses a campaign row written before the field existed', () => {
    const parsed = AudienceSchema.parse(LEGACY_AUDIENCE_JSON);
    expect(parsed.bookOrderStatuses).toEqual([]);
  });

  it('starts empty — no filter on this axis, never "nobody"', () => {
    expect(EMPTY_AUDIENCE.bookOrderStatuses).toEqual([]);
  });

  it('accepts the states the admin actually ticks', () => {
    const parsed = AudienceSchema.parse({
      ...LEGACY_AUDIENCE_JSON,
      bookOrderStatuses: ['paid', 'shipped', 'delivered'],
    });
    expect(parsed.bookOrderStatuses).toEqual(['paid', 'shipped', 'delivered']);
  });

  it('refuses a state the database has no label for', () => {
    const parsed = AudienceSchema.safeParse({
      ...LEGACY_AUDIENCE_JSON,
      // `deleted` is a VIEW on `/admin/books`, not a status — see
      // `BookOrderStatusSchema`. A picker that accepted it would filter on a
      // value no row can hold.
      bookOrderStatuses: ['deleted'],
    });
    expect(parsed.success).toBe(false);
  });

  /**
   * The picker renders one checkbox per `BookOrderStatusSchema` option and
   * reads its label out of the copy table by the wire value. Adding a sixth
   * status without a word for it ships a checkbox labelled `undefined`, which
   * TypeScript catches only if the table is typed — it is a plain object
   * literal in `copy/admin.ts`, so this is the check.
   */
  it('has an Arabic label for every book order state, and no spare ones', () => {
    const labels = copy.marketing.audienceBookOrderState;
    expect(Object.keys(labels).sort()).toEqual([...BookOrderStatusSchema.options].sort());
    for (const label of Object.values(labels)) expect(label.length).toBeGreaterThan(0);
  });
});
