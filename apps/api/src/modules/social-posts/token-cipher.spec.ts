import { openToken, sealToken, tokenHint, tokenKey } from './token-cipher';

const SECRET = 'x'.repeat(40);

describe('token-cipher', () => {
  it('round-trips a token, and the ciphertext does not contain it', () => {
    const key = tokenKey(SECRET);
    const sealed = sealToken('EAAB-page-token-1234', key);
    expect(sealed).not.toContain('EAAB');
    expect(openToken(sealed, key)).toBe('EAAB-page-token-1234');
  });

  it('seals the same token differently every time', () => {
    const key = tokenKey(SECRET);
    expect(sealToken('t'.repeat(30), key)).not.toBe(sealToken('t'.repeat(30), key));
  });

  it('reads nothing under a rotated secret, rather than throwing', () => {
    const sealed = sealToken('EAAB-page-token', tokenKey(SECRET));
    expect(openToken(sealed, tokenKey('y'.repeat(40)))).toBeNull();
  });

  it('refuses a tampered or foreign value', () => {
    const key = tokenKey(SECRET);
    const sealed = sealToken('EAAB-page-token', key);
    const flipped = `${sealed.slice(0, -2)}${sealed.endsWith('A') ? 'B' : 'A'}${sealed.slice(-1)}`;
    expect(openToken(flipped, key)).toBeNull();
    expect(openToken('EAAB-plaintext', key)).toBeNull();
    expect(openToken('v1.', key)).toBeNull();
  });

  it('hints with the last four characters only', () => {
    expect(tokenHint('EAAB-page-token-9xYz')).toBe('9xYz');
  });
});
