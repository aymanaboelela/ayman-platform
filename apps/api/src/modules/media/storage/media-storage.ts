import type { Readable } from 'node:stream';

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

/**
 * The seam that makes S3/R2 a swap rather than a rewrite. Deliberately
 * narrow: no listing, no signed URLs, no metadata — the database is the
 * index, the bucket is a byte store.
 */
export interface MediaStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  getStream(key: string): Promise<Readable>;
  stat(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}
