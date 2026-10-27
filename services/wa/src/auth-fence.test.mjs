import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fenceAuthState } from './auth-fence.mjs';

function fakeAuth() {
  const writes = [];
  const state = {
    creds: { me: { id: 'x' } },
    keys: {
      get: async (type, ids) => ({ type, ids }),
      set: async (data) => {
        writes.push(['keys', data]);
      },
    },
  };
  const saveCreds = async () => {
    writes.push(['creds']);
  };
  return { state, saveCreds, writes };
}

describe('fenceAuthState', () => {
  it('passes writes through while the socket is current', async () => {
    const { state, saveCreds, writes } = fakeAuth();
    const fenced = fenceAuthState(state, saveCreds, () => true);
    await fenced.state.keys.set({ session: { a: 1 } });
    await fenced.saveCreds();
    assert.deepEqual(writes, [['keys', { session: { a: 1 } }], ['creds']]);
  });

  it('drops writes from a socket that has been replaced — a clear stays a clear', async () => {
    const { state, saveCreds, writes } = fakeAuth();
    let current = true;
    const fenced = fenceAuthState(state, saveCreds, () => current);
    current = false; // `/unlink` bumped the generation
    await fenced.state.keys.set({ session: { a: 1 } });
    await fenced.saveCreds();
    assert.deepEqual(writes, []);
  });

  it('never fences reads', async () => {
    const { state, saveCreds } = fakeAuth();
    const fenced = fenceAuthState(state, saveCreds, () => false);
    assert.deepEqual(await fenced.state.keys.get('session', ['a']), { type: 'session', ids: ['a'] });
  });

  it('keeps the SAME creds object, which the socket mutates in place', () => {
    const { state, saveCreds } = fakeAuth();
    const fenced = fenceAuthState(state, saveCreds, () => true);
    assert.equal(fenced.state.creds, state.creds);
  });
});
