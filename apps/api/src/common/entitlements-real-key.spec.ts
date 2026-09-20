/**
 * المفتاح الحقيقي، مش مفتاح بيتولّد في التست.
 *
 * باقي تستات المستند بتولّد زوج مفاتيح جوّه التست — فبتثبت إن **الآلية**
 * شغالة، لكنها ماتقدرش تمسك أشهر فشل في النظام ده: إن المفتاح العام المكمپايل
 * في `CONTROL_PUBLIC_KEYS` مش طالع من المفتاح الخاص اللي أيمن بيوقّع بيه فعلًا.
 *
 * لو الزوج مش متطابق، كل مستند بيتوقّع بيترفض، وكل مدرّس بيرجع للافتراضي —
 * في صمت، لأن الرفض بيتكتب في لوج ومابيوقّفش حاجة. التست ده بيوقّع بالمفتاح
 * الحقيقي ويتحقّق بالعام المكمپايل، فالتطابق بيبقى مثبت مش مفترض.
 */
import { createPrivateKey, sign as signRaw } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyEntitlementsDocument, CONTROL_PUBLIC_KEYS } from './entitlements';

const PEM = process.env.CONTROL_SIGNING_KEY_PATH ?? '';
const b64u = (input: string | Buffer) => Buffer.from(input).toString('base64url');

const maybe = PEM && readFileSync ? describe : describe.skip;

maybe('the real signing key', () => {
  it('signs a document the compiled public key accepts', async () => {
    const header = b64u(JSON.stringify({ alg: 'EdDSA', kid: 'cp-2026-01' }));
    const now = Math.floor(Date.now() / 1000);
    const body = b64u(JSON.stringify({
      iss: 'ayman-platform-control',
      sub: 'sabry',
      ver: 1,
      iat: now,
      nbf: now,
      exp: now + 3600,
      features: { books: false, homework: true },
    }));
    const input = `${header}.${body}`;
    const key = createPrivateKey(readFileSync(PEM, 'utf8'));
    const token = `${input}.${b64u(signRaw(null, Buffer.from(input), key))}`;

    const result = await verifyEntitlementsDocument(token, {
      tenantKey: 'sabry',
      keys: CONTROL_PUBLIC_KEYS,
    });
    expect(result).toBeTruthy();
    expect(result?.features).toEqual({ books: false, homework: true });
  });
});
