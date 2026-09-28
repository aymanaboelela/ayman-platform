import { tokensMatch } from './tokens-match';

describe('tokensMatch', () => {
  it('matches the same secret', () => {
    expect(tokensMatch('s3cret-token', 's3cret-token')).toBe(true);
  });

  it('refuses a different or partial secret', () => {
    expect(tokensMatch('s3cret-tokeX', 's3cret-token')).toBe(false);
    expect(tokensMatch('s3cret', 's3cret-token')).toBe(false);
  });

  it('refuses when either side is missing — an unset secret opens nothing', () => {
    expect(tokensMatch(undefined, 's3cret-token')).toBe(false);
    expect(tokensMatch('s3cret-token', undefined)).toBe(false);
    expect(tokensMatch('', '')).toBe(false);
  });
});
