// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Imported after the mock, the way `tenant-env.test.ts` does: the package has
// no resolvable entry outside a Next build.
const { documentFeatures } = await import('./tenants');

const NOW = 1_800_000_000;

/** A compact JWS with this payload. The signature is never read here. */
function token(payload: object): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'EdDSA' })}.${part(payload)}.sig`;
}

/**
 * What the signing form starts an instructor's boxes from. The rule that
 * matters: anything that is NOT a live, readable document is `null`, so the
 * form falls back to the declared defaults — which is what that stack runs.
 */
describe('documentFeatures', () => {
  it('reads the feature map of a live document', () => {
    expect(documentFeatures(token({ exp: NOW + 60, features: { 'video.upload': true, books: false } }), NOW)).toEqual({
      'video.upload': true,
      books: false,
    });
  });

  it('drops values that are not booleans', () => {
    expect(documentFeatures(token({ exp: NOW + 60, features: { books: 'yes', homework: true } }), NOW)).toEqual({
      homework: true,
    });
  });

  it('is null for an expired document — the stack is already back on its defaults', () => {
    expect(documentFeatures(token({ exp: NOW - 1, features: { 'video.upload': true } }), NOW)).toBeNull();
    expect(documentFeatures(token({ exp: NOW, features: { 'video.upload': true } }), NOW)).toBeNull();
  });

  it('is null for no document, an unreadable one, or one with no feature map', () => {
    expect(documentFeatures(undefined, NOW)).toBeNull();
    expect(documentFeatures('', NOW)).toBeNull();
    expect(documentFeatures('not-a-token', NOW)).toBeNull();
    expect(documentFeatures('a.%%%.c', NOW)).toBeNull();
    expect(documentFeatures(token({ exp: NOW + 60 }), NOW)).toBeNull();
    expect(documentFeatures(token({ exp: NOW + 60, features: ['books'] }), NOW)).toBeNull();
    expect(documentFeatures(token({ features: { books: true } }), NOW)).toBeNull();
  });
});
