import { generateKeyPairSync } from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { CONTROL_ISSUER, ENTITLEMENTS_VERSION } from '@ayman/contracts/admin/entitlements';
import { OWNER_SIGN_IN_AUDIENCE, OWNER_SIGN_IN_TYP } from '@ayman/contracts/admin/owner-sign-in';
import { verifyOwnerSignInToken } from './owner-sign-in';

/**
 * A throwaway pair, so nothing here touches `CONTROL_PUBLIC_KEYS`. The token
 * shape mirrors `signOwnerSignInToken` in `apps/web/lib/control-plane.ts`.
 */
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keys = { 'test-kid': publicKey.export({ type: 'spki', format: 'pem' }).toString() };
const NOW = new Date('2026-10-27T12:00:00Z');
const nowSeconds = Math.floor(NOW.getTime() / 1000);

async function token(overrides: { header?: Record<string, unknown>; payload?: Record<string, unknown> } = {}) {
  const key = await importPKCS8(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'EdDSA');
  return new SignJWT({
    iss: CONTROL_ISSUER,
    sub: 'adel',
    aud: OWNER_SIGN_IN_AUDIENCE,
    jti: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    iat: nowSeconds,
    nbf: nowSeconds,
    exp: nowSeconds + 60,
    ...overrides.payload,
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'test-kid', typ: OWNER_SIGN_IN_TYP, ...overrides.header })
    .sign(key);
}

const verify = (jws: string, tenantKey = 'adel', currentDate = NOW) =>
  verifyOwnerSignInToken(jws, { keys, tenantKey, currentDate });

describe('verifyOwnerSignInToken', () => {
  it('accepts a fresh token signed for this stack', async () => {
    await expect(verify(await token())).resolves.toEqual({
      jti: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      exp: nowSeconds + 60,
    });
  });

  it('refuses an entitlements document — same key, same iss and sub, sitting in the instructor’s env', async () => {
    const document = await token({
      header: { typ: undefined },
      payload: { aud: undefined, jti: undefined, ver: ENTITLEMENTS_VERSION, exp: nowSeconds + 86_400 * 365, features: {} },
    });
    await expect(verify(document)).rejects.toThrow();
  });

  it('refuses the right typ without the audience, and the audience without the typ', async () => {
    await expect(verify(await token({ payload: { aud: undefined } }))).rejects.toThrow();
    await expect(verify(await token({ header: { typ: undefined } }))).rejects.toThrow();
  });

  it('refuses a token signed for another instructor', async () => {
    await expect(verify(await token(), 'sabry')).rejects.toThrow();
  });

  it('is never accepted on the owner’s own stack', async () => {
    await expect(verify(await token({ payload: { sub: 'ayman' } }), 'ayman')).rejects.toThrow(/owner stack/);
  });

  it('refuses an expired click', async () => {
    await expect(verify(await token(), 'adel', new Date(NOW.getTime() + 5 * 60_000))).rejects.toThrow();
  });

  it('refuses a validly signed token that lives longer than a minute', async () => {
    await expect(verify(await token({ payload: { exp: nowSeconds + 3600 } }))).rejects.toThrow(/longer/);
  });

  it('refuses a token with no jti to burn', async () => {
    await expect(verify(await token({ payload: { jti: undefined } }))).rejects.toThrow(/jti/);
  });

  it('refuses a key it does not know', async () => {
    await expect(verify(await token({ header: { kid: 'other' } }))).rejects.toThrow(/unknown signing key/);
  });
});
