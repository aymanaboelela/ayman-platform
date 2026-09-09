import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MirrorConfig } from './mirror-config';
import { adoptableLadder } from './mirror-pipeline';

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
  '.jpg': 'image/jpeg',
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

  /**
   * What the bucket ALREADY holds for one video, or `null`.
   *
   * This exists because the worker cannot always be the thing that fills the
   * bucket. YouTube refuses a data-centre IP outright — «Sign in to confirm
   * you're not a bot», every client, every video — so the backfill is run
   * from a machine on a residential connection (`scripts/mirror-local.ts`)
   * and the objects land here without any row ever changing.
   *
   * Reading them back is what turns those objects into a `ready` lecture.
   * The alternative was a hand-written UPDATE against production, which is
   * both unrepeatable and a claim no one can check: this asks the bucket.
   *
   * ⚠️ The completeness test is the MASTER PLAYLIST PLUS ITS VARIANTS, not
   * "some objects exist". An interrupted upload leaves a prefix full of
   * segments, and adopting that marks a lecture `ready` whose player stalls
   * partway through a rung — a failure no status anywhere would show.
   */
  async describeLadder(prefix: string): Promise<{ maxHeight: number; bytes: number } | null> {
    const sizes = new Map<string, number>();
    let token: string | undefined;

    do {
      const listed = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: `${prefix}/`,
          ContinuationToken: token,
        }),
      );
      for (const object of listed.Contents ?? []) {
        if (object.Key !== undefined) sizes.set(object.Key, object.Size ?? 0);
      }
      token = listed.IsTruncated === true ? listed.NextContinuationToken : undefined;
    } while (token !== undefined);

    const masterKey = `${prefix}/master.m3u8`;
    if (!sizes.has(masterKey)) return null;

    const master = await this.s3.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: masterKey }),
    );
    // Small by construction — a handful of lines, one per rung.
    const text = (await master.Body?.transformToString()) ?? '';

    const maxHeight = adoptableLadder(prefix, text, new Set(sizes.keys()));
    if (maxHeight === null) return null;

    let bytes = 0;
    for (const size of sizes.values()) bytes += size;

    return { maxHeight, bytes };
  }

  /* ── الرفع المباشر ───────────────────────────────────────────────────────
   *
   * The API signs; the BROWSER sends. Not an optimisation — the alternative
   * puts an hour-long multi-gigabyte transfer through the Node process and
   * the reverse proxy, where a dropped connection at minute fifty starts
   * again from zero and a second admin uploading at the same time competes
   * for the same memory the site is served from.
   *
   * Nothing here ever takes a key from a caller. Every key is built from an
   * upload id that has already been matched against `UPLOAD_ID_RE`.
   */

  /** Open a multipart upload and return S3's id for it. */
  async createMultipart(key: string, contentType: string): Promise<string> {
    const created = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (created.UploadId === undefined) {
      throw new Error('التخزين مرجّعش رقم للرفع — جرّب تاني');
    }
    return created.UploadId;
  }

  /**
   * A pre-signed PUT per part.
   *
   * Signed UP FRONT rather than one at a time: a round trip to us before each
   * part would add a second of latency to every 21 MB, and the browser is
   * uploading four parts at once precisely so it never waits.
   *
   * The expiry is the real constraint. It has to outlast the slowest upload
   * anyone will actually attempt — 8 GB on a 5 Mbit ADSL line is over three
   * hours — while staying far below SigV4's seven-day maximum, because these
   * URLs are write access to our bucket in a browser's memory.
   */
  async presignParts(
    key: string,
    uploadId: string,
    partCount: number,
    expiresInSeconds: number,
  ): Promise<{ partNumber: number; url: string }[]> {
    const parts: { partNumber: number; url: string }[] = [];
    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      const url = await getSignedUrl(
        this.s3,
        new UploadPartCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: expiresInSeconds },
      );
      parts.push({ partNumber, url });
    }
    return parts;
  }

  /**
   * Seal the upload. S3 needs every part's ETag, in order, and rejects the
   * whole thing otherwise — which is the property that makes this the moment
   * the object becomes real. Until it succeeds there is no source file, so a
   * browser that closed mid-upload leaves parts that expire rather than a
   * truncated video the transcoder would faithfully encode.
   */
  async completeMultipart(
    key: string,
    uploadId: string,
    parts: readonly { partNumber: number; etag: string }[],
  ): Promise<void> {
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({
              PartNumber: part.partNumber,
              // Browsers hand back the ETag header with its quotes; the SDK
              // wants it either way, and normalising here means one shape in
              // the logs.
              ETag: part.etag.replaceAll('"', ''),
            })),
        },
      }),
    );
  }

  /**
   * Throw the parts away.
   *
   * Called when the admin cancels and when a session is replaced. Worth doing
   * explicitly: incomplete multipart parts are STORED and BILLED, and they are
   * invisible to every listing — a bucket can quietly hold hundreds of
   * gigabytes of them with nothing in the console to show for it.
   */
  async abortMultipart(key: string, uploadId: string): Promise<void> {
    await this.s3
      .send(
        new AbortMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      )
      .catch(() => undefined);
  }

  /** Size of an object, or null when it is not there. */
  async sizeOf(key: string): Promise<number | null> {
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Stream an object to a local file.
   *
   * To DISK, not to memory. The source of a two-hour lecture is gigabytes and
   * `transformToByteArray()` on it is an out-of-memory kill of the API
   * container — which, on a single-container deployment, is the whole site
   * going down because someone uploaded a long lesson.
   */
  async downloadTo(key: string, file: string): Promise<void> {
    const object = await this.s3.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    if (object.Body === undefined) throw new Error('الملف اللي اترفع مش موجود في التخزين');
    await pipeline(object.Body as Readable, createWriteStream(file));
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3
      .send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }))
      .catch(() => undefined);
  }
}
