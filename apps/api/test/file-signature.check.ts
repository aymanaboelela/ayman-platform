/**
 * Runs under tsx (native ESM), so it exercises the REAL `file-type` module —
 * Jest's CommonJS loader cannot import an ESM-only package at all, which is
 * exactly the interop hazard `FileSignatureService`'s dynamic import exists
 * to isolate. A failure here fails the build (wired into the api `test`
 * script).
 */
import assert from 'node:assert/strict';
import { FileSignatureService } from '../src/modules/media/file-signature.service';

const service = new FileSignatureService();

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');
const GIF_HTML_POLYGLOT = Buffer.concat([
  Buffer.from('GIF89a', 'ascii'),
  Buffer.from('<script>alert(1)</script>', 'ascii'),
]);
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>', 'ascii');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', 'ascii');

async function main(): Promise<void> {
  const png = await service.detect(PNG);
  assert.equal(png?.mime, 'image/png', 'PNG magic bytes must be detected');

  const jpeg = await service.detect(JPEG);
  assert.equal(jpeg?.mime, 'image/jpeg', 'JPEG magic bytes must be detected');

  // A polyglot sniffs as GIF — which is exactly why detection alone is NOT
  // the control. The sharp re-encode in MediaService is what destroys the
  // payload.
  const polyglot = await service.detect(GIF_HTML_POLYGLOT);
  assert.equal(polyglot?.mime, 'image/gif', 'a GIF/HTML polyglot still sniffs as GIF');

  assert.equal(await service.detect(HTML), null, 'raw HTML must not sniff as any allowed type');

  // file-type does not detect SVG at all (it is text, not a binary
  // container), so SVG is rejected by "no detected type", on top of the
  // MIME allowlist.
  assert.equal(await service.detect(SVG), null, 'SVG must not produce a detected type');

  console.log('file-signature checks passed');
}

// No top-level `await`: `apps/api`'s package.json has no `"type": "module"`
// (the project compiles to CommonJS via SWC), and tsx/esbuild resolves a
// bare `.ts` script's output format from that same field — so a top-level
// `await` here fails to transform under the project's own module system,
// even though tsx itself runs as native ESM.
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
