import { Injectable } from '@nestjs/common';

export interface DetectedType {
  mime: string;
  ext: string;
}

/**
 * Magic-byte detection. Reads the BUFFER — never the Content-Type header,
 * which is attacker-supplied and means nothing.
 *
 * `file-type` v22 is ESM-only and this app is CommonJS, so the import is
 * dynamic and cached. It is behind a Nest provider so every consumer's unit
 * test injects a fake and never touches the real module.
 *
 * The real round-trip through `file-type` is covered by
 * `apps/api/test/file-signature.check.ts`, which runs under tsx (native ESM)
 * rather than under Jest's CommonJS loader.
 *
 * `.swcrc`'s `module.ignoreDynamic: true` is what keeps the `import(...)`
 * below a REAL dynamic import in `nest build`'s compiled `dist/` output,
 * rather than SWC's default rewrite into `require("file-type")` (which
 * throws `ERR_REQUIRE_ESM` — file-type v22 ships no CJS entry at all).
 * Jest's `@swc/jest` transform, configured inline in this package's
 * `package.json` (not `.swcrc`), deliberately OMITS `ignoreDynamic` instead:
 * Prisma 7's generated client also does its own lazy `import(...)` (loading
 * its WASM query compiler), and Jest's environment throws "a dynamic import
 * callback was invoked without --experimental-vm-modules" the moment THAT
 * import is left real instead of rewritten. The two needs are opposite, so
 * there are two configs rather than one shared `ignoreDynamic` setting.
 */
@Injectable()
export class FileSignatureService {
  private loader?: Promise<(buffer: Uint8Array) => Promise<DetectedType | undefined>>;

  private load(): Promise<(buffer: Uint8Array) => Promise<DetectedType | undefined>> {
    this.loader ??= import('file-type').then((module) => module.fileTypeFromBuffer);
    return this.loader;
  }

  async detect(buffer: Buffer): Promise<DetectedType | null> {
    const fileTypeFromBuffer = await this.load();
    const detected = await fileTypeFromBuffer(buffer);
    return detected ? { mime: detected.mime, ext: detected.ext } : null;
  }
}
