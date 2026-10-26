import { describe, expect, it } from 'vitest';
import { qrMatrix, tierFor } from './model';

describe('tierFor', () => {
  it('names the band a score falls in', () => {
    expect(tierFor(20, 20)).toBe('perfect');
    expect(tierFor(18, 20)).toBe('legendary');
    expect(tierFor(15, 20)).toBe('high');
    expect(tierFor(10, 20)).toBe('onTrack');
  });

  it('offers no card below half, or for a paper with no marks', () => {
    expect(tierFor(9, 20)).toBeNull();
    expect(tierFor(0, 0)).toBeNull();
    expect(tierFor(Number.NaN, 20)).toBeNull();
  });
});

describe('qrMatrix', () => {
  it('is a square of booleans that survives JSON', () => {
    const qr = qrMatrix('https://example.com');
    expect(qr.bits).toHaveLength(qr.size * qr.size);
    expect(JSON.parse(JSON.stringify(qr))).toEqual(qr);
  });
});
