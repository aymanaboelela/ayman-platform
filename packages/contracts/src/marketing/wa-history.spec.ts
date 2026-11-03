import { describe, expect, it } from 'vitest';
import { AudienceSchema, EMPTY_AUDIENCE } from '@ayman/contracts/marketing/campaign';
import { DEFAULT_PACING, type Pacing } from '@ayman/contracts/marketing/pacing';
import {
  WA_HISTORY_FILTERS,
  WaHistoryIngestSchema,
  noFasterThan,
} from '@ayman/contracts/marketing/wa-history';
import { StudentListQuerySchema } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/wa-history';

/**
 * «كلّمني / مكلّمنيش» — the parts no API spec can see: what an OLD campaign row
 * parses to, that the ingest has nowhere to carry a message body, and that the
 * risky audience can only ever slow a campaign down.
 */
describe('AudienceSchema — waHistory', () => {
  /** A campaign row written before the field existed, frozen as it was. */
  const LEGACY_AUDIENCE_JSON = {
    students: true,
    parents: false,
    years: [],
    schoolStreams: [],
    courseIds: [],
    notSubscribedOnly: false,
    neverSubscribed: false,
    bookOrderStatuses: [],
    extraPhones: [],
    leads: false,
    leadStatuses: [],
  };

  it('parses a campaign row written before the field existed, as no filter', () => {
    expect(AudienceSchema.parse(LEGACY_AUDIENCE_JSON).waHistory).toBeNull();
  });

  it('starts as no filter — never "nobody"', () => {
    expect(EMPTY_AUDIENCE.waHistory).toBeNull();
  });

  it('accepts both answers and refuses anything else', () => {
    for (const value of WA_HISTORY_FILTERS) {
      expect(AudienceSchema.parse({ ...LEGACY_AUDIENCE_JSON, waHistory: value }).waHistory).toBe(value);
    }
    expect(AudienceSchema.safeParse({ ...LEGACY_AUDIENCE_JSON, waHistory: 'maybe' }).success).toBe(false);
  });

  it('the students list query defaults to no filter too', () => {
    expect(StudentListQuerySchema.parse({}).waChat).toBeNull();
    expect(StudentListQuerySchema.parse({ waChat: 'never' }).waChat).toBe('never');
  });
});

describe('WaHistoryIngestSchema', () => {
  const entry = {
    phone: '+201012345678',
    hasChat: true,
    theyWroteToUs: true,
    inboundCount: 3,
    lastMessageAt: '2026-10-01T10:00:00.000Z',
    lastInboundAt: '2026-10-01T09:00:00.000Z',
  };

  it('keeps counts and timestamps', () => {
    expect(WaHistoryIngestSchema.parse({ entries: [entry] }).entries[0]).toEqual(entry);
  });

  it('has nowhere to put a message body: an extra field is dropped, not stored', () => {
    const parsed = WaHistoryIngestSchema.parse({ entries: [{ ...entry, text: 'سر', lastMessage: 'سر' }] });
    expect(JSON.stringify(parsed)).not.toContain('سر');
  });

  it('refuses an empty batch and an oversized one', () => {
    expect(WaHistoryIngestSchema.safeParse({ entries: [] }).success).toBe(false);
    expect(WaHistoryIngestSchema.safeParse({ entries: Array.from({ length: 1001 }, () => entry) }).success).toBe(false);
  });
});

describe('noFasterThan', () => {
  const fast: Pacing = {
    minDelaySeconds: 5,
    maxDelaySeconds: 10,
    batchSize: 0,
    batchPauseMinutes: 0,
    dailyCap: 1000,
    windowStartHour: 0,
    windowEndHour: 24,
  };

  it('pulls every brake of a fast pacing back to the defaults', () => {
    expect(noFasterThan(fast, DEFAULT_PACING)).toEqual(DEFAULT_PACING);
  });

  it('leaves the defaults exactly as they are', () => {
    expect(noFasterThan(DEFAULT_PACING, DEFAULT_PACING)).toEqual(DEFAULT_PACING);
  });

  it('keeps a pacing the admin already made slower', () => {
    const slower: Pacing = {
      minDelaySeconds: 200,
      maxDelaySeconds: 400,
      batchSize: 5,
      batchPauseMinutes: 60,
      dailyCap: 30,
      windowStartHour: 12,
      windowEndHour: 18,
    };
    expect(noFasterThan(slower, DEFAULT_PACING)).toEqual(slower);
  });

  it('never yields a window that closes before it opens', () => {
    const late: Pacing = { ...DEFAULT_PACING, windowStartHour: 23, windowEndHour: 24 };
    const result = noFasterThan(late, DEFAULT_PACING);
    expect(result.windowEndHour).toBeGreaterThan(result.windowStartHour);
    expect(result.maxDelaySeconds).toBeGreaterThanOrEqual(result.minDelaySeconds);
  });
});

describe('copy/wa-history', () => {
  it('has a label for every filter value the screens render', () => {
    for (const value of WA_HISTORY_FILTERS) {
      expect(copy.filterLabels[value]).toBeTruthy();
      expect(copy.audience.options[value]).toBeTruthy();
      expect(copy.audience.hints[value]).toBeTruthy();
    }
  });
});
