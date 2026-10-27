import { describe, expect, it } from 'vitest';
import { closeCodeOf, closeReasonFor, waErrorFor } from '@ayman/contracts/marketing/wa-errors';

describe('waErrorFor', () => {
  it('names 463 for what it is — new chats are blocked', () => {
    expect(waErrorFor('463')).toContain('463');
    expect(waErrorFor('463')).toContain('محادثات جديدة');
  });

  it('an unknown code is passed through, never dropped', () => {
    expect(waErrorFor('418')).toContain('418');
  });

  it('no code, no sentence', () => {
    expect(waErrorFor(null)).toBeNull();
    expect(waErrorFor('')).toBeNull();
  });
});

describe('closeReasonFor', () => {
  it('reads the code out of the sidecar detail', () => {
    expect(closeCodeOf('closed: 401 (logged out — the phone removed this device)')).toBe('401');
    expect(closeReasonFor('closed: 403 (WhatsApp refused this account — banned or locked)')).toContain('اتحظر');
  });

  it('null for a detail with no known code', () => {
    expect(closeReasonFor('closed')).toBeNull();
    expect(closeReasonFor('closed: 499')).toBeNull();
    expect(closeReasonFor(null)).toBeNull();
  });
});
