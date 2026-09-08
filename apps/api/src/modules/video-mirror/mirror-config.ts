import type { Env } from '../../config/env';

/**
 * Everything the mirror needs, or nothing at all.
 *
 * The five variables are ALL-OR-NOTHING and that is enforced rather than
 * documented. Half of them set is not a smaller feature — it is a bucket the
 * worker cannot write to, or bytes it writes and no student can read, and in
 * both cases the symptom appears days later as «الفيديو مش شغال» from one
 * school. This platform has already lost time twice to a production database
 * that was silently half-configured; a boot that refuses is cheaper than a
 * fortnight of that.
 *
 * Unset entirely is a first-class state, not a misconfiguration: locally, in
 * CI, and on any deployment without a bucket, the worker never starts and
 * every player falls back to YouTube. Nothing about that path is degraded
 * relative to the platform as it shipped before this feature existed.
 */
export interface MirrorConfig {
  /** The credentialed S3 endpoint. Internal; never sent to a browser. */
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** The public origin students fetch from. Ends without a trailing slash. */
  readonly publicUrl: string;
  readonly concurrency: number;
}

const REQUIRED = [
  'VIDEO_MIRROR_ENDPOINT',
  'VIDEO_MIRROR_BUCKET',
  'VIDEO_MIRROR_ACCESS_KEY_ID',
  'VIDEO_MIRROR_SECRET_ACCESS_KEY',
  'VIDEO_MIRROR_PUBLIC_URL',
] as const;

/**
 * `null` when the feature is off, a complete config when it is on, and a
 * thrown error for anything in between.
 */
export function mirrorConfigFrom(env: Env): MirrorConfig | null {
  const present = REQUIRED.filter((key) => {
    const value = env[key];
    return typeof value === 'string' && value.length > 0;
  });

  if (present.length === 0) return null;

  if (present.length !== REQUIRED.length) {
    const missing = REQUIRED.filter((key) => !present.includes(key));
    throw new Error(
      `The video mirror is half-configured: ${present.join(', ')} set but ${missing.join(', ')} missing. ` +
        'Set all five or none — a partial config is a bucket nothing can write to or nothing can read.',
    );
  }

  const publicUrl = env.VIDEO_MIRROR_PUBLIC_URL as string;

  return {
    endpoint: env.VIDEO_MIRROR_ENDPOINT as string,
    bucket: env.VIDEO_MIRROR_BUCKET as string,
    accessKeyId: env.VIDEO_MIRROR_ACCESS_KEY_ID as string,
    secretAccessKey: env.VIDEO_MIRROR_SECRET_ACCESS_KEY as string,
    publicUrl: publicUrl.endsWith('/') ? publicUrl.slice(0, -1) : publicUrl,
    concurrency: env.VIDEO_MIRROR_CONCURRENCY,
  };
}
