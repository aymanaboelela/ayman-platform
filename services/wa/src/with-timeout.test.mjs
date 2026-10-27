import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from './with-timeout.mjs';

describe('withTimeout', () => {
  it('passes a prompt answer through', async () => {
    assert.equal(await withTimeout(Promise.resolve(7), 1000, 'fallback'), 7);
  });

  it('falls back when the promise never settles', async () => {
    assert.equal(await withTimeout(new Promise(() => {}), 10, 'fallback'), 'fallback');
  });

  it('falls back on a rejection', async () => {
    assert.equal(await withTimeout(Promise.reject(new Error('x')), 1000, null), null);
  });

  it('tolerates a non-promise (an optional method that is missing)', async () => {
    assert.equal(await withTimeout(undefined, 1000, 'f'), undefined);
  });
});
