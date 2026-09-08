import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { MirrorConfig } from './mirror-config';

/**
 * Content types for the three extensions an HLS ladder is made of.
 *
 * These are not cosmetic. A playlist served as `application/octet-stream` is
 * downloaded rather than played by Safari, and a segment with the wrong type
 * is refused by some corporate proxies — which is the entire population this
 * feature exists for. R2 stores whatever it is told and never guesses, so
 * getting this wrong here is getting it wrong for every student.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
};

function contentTypeOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return (dot === -1 ? undefined : CONTENT_TYPES[path.slice(dot)]) ?? 'application/octet-stream';
}

/**
 * Immutable, for a year.
 *
 * Safe because the object key contains the YouTube id and the bytes under it
 * are one specific encode of one specific video — there is no edit that
 * changes a segment in place. Re-mirroring writes the same keys with the same
 * content, and a video that is genuinely replaced gets a new id and a new
 * prefix.
 *
 * This is also most of the reason the bandwidth bill is zero: a lecture
 * watched by four thousand students is fetched from the bucket a handful of
 * times and served from the edge cache after that.
 */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export class MirrorStorage {
  private readonly s3: S3Client;

  constructor(private readonly config: MirrorConfig) {
    this.s3 = new S3Client({
      // R2 has no regions, but the SDK refuses to sign without one.
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Upload a packaged ladder under `prefix`.
   *
   * `master.m3u8` goes LAST, deliberately. It is the only object the player
   * asks for by name, so until it exists the prefix is invisible — a run that
   * dies halfway leaves orphaned segments costing a few piastres of storage
   * rather than a playlist pointing at segments that were never written,
   * which is a player that spins forever on exactly the tablets this feature
   * is for.
   */
  async uploadLadder(dir: string, files: readonly string[], prefix: string): Promise<void> {
    const master = 'master.m3u8';
    const rest = files.filter((file) => file !== master);

    for (const file of rest) await this.putFile(dir, file, prefix);
    if (files.includes(master)) await this.putFile(dir, master, prefix);
  }

  private async putFile(dir: string, file: string, prefix: string): Promise<void> {
    const full = join(dir, file);
    const { size } = await stat(full);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        // Object keys use forward slashes on every platform; `file` comes
        // from `relative()` and would carry backslashes on Windows.
        Key: `${prefix}/${file.split(/[\\/]/).join('/')}`,
        Body: createReadStream(full),
        // A stream body has no length the SDK can infer, and R2 rejects an
        // unsigned-length upload.
        ContentLength: size,
        ContentType: contentTypeOf(file),
        CacheControl: CACHE_CONTROL,
      }),
    );
  }

  /**
   * Remove everything under a prefix. Used before a re-mirror, so a ladder
   * that shrank from three rungs to two does not leave the third behind for
   * the master playlist of a later run to not mention and nobody to notice
   * paying for.
   */
  async deletePrefix(prefix: string): Promise<void> {
    let token: string | undefined;

    do {
      const listed = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: `${prefix}/`,
          ContinuationToken: token,
        }),
      );

      const keys = (listed.Contents ?? []).flatMap((object) =>
        object.Key === undefined ? [] : [{ Key: object.Key }],
      );

      if (keys.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: { Objects: keys, Quiet: true },
          }),
        );
      }

      token = listed.IsTruncated === true ? listed.NextContinuationToken : undefined;
    } while (token !== undefined);
  }
}
