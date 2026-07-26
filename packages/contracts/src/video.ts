import { z } from 'zod';

/**
 * Seven providers, because widening this enum later means an ALTER TYPE plus a
 * migration across every lesson_videos row, and widening it now costs nothing.
 * v1 only ever writes 'youtube' — LessonVideoInputSchema refuses the rest until
 * a real integration exists behind each one.
 */
export const VideoProviderSchema = z.enum([
  'youtube',
  'upload',
  'vimeo',
  'bunny',
  'vdocipher',
  'ink',
  'gumlet',
]);
export type VideoProvider = z.infer<typeof VideoProviderSchema>;

/**
 * A YouTube video id is exactly 11 characters of URL-safe base64. Nothing else
 * is ever stored in `lesson_videos.external_id`, and a Postgres CHECK constraint
 * enforces the same shape at the database level.
 */
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Host ALLOWLIST, not a substring match. `youtube.com.evil.example` contains
 * "youtube.com" and is the single most common bypass of a naive check.
 */
const YOUTUBE_HOSTS: ReadonlySet<string> = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

/** Path forms that carry the id as the first segment after the prefix. */
const ID_BEARING_PREFIXES = ['embed', 'shorts', 'live', 'v'] as const;

/**
 * Reduce any YouTube URL to its 11-character id, or return null.
 *
 * SECURITY CONTRACT: this function PARSES and DISCARDS. It never performs a
 * network request, never follows a redirect, never resolves a hostname, and
 * never returns any part of the input other than an id that matches
 * YOUTUBE_ID_RE. That is what makes the SSRF class structurally absent instead
 * of filtered — there is no code path that can be talked into fetching
 * 169.254.169.254 because there is no code path that fetches anything.
 */
export function extractYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 2048) return null;

  // A bare id is the canonical stored form. Accepting it means re-saving a
  // lesson does not force the admin to paste the original URL again.
  if (YOUTUBE_ID_RE.test(raw)) return raw;

  let url: URL;
  try {
    // Only prefix a scheme when the input has no scheme at all. `javascript:`
    // contains ':' but not '://', and prefixing it would produce a URL whose
    // host is "javascript" — which the host allowlist below rejects anyway.
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // `username`/`password` are how `https://www.youtube.com@evil.example/` reads
  // as trustworthy to a human. URL parsing already puts the real host in
  // `hostname`, but rejecting userinfo outright removes the ambiguity.
  if (url.username !== '' || url.password !== '') return null;
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  // `pathname` is already normalised by the URL parser, so `/embed/../../x`
  // has collapsed before we see it — the segment split below cannot be walked.
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);

  let candidate: string | null = null;

  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    candidate = segments[0] ?? null;
  } else if (segments.length === 1 && segments[0] === 'watch') {
    candidate = url.searchParams.get('v');
  } else if (segments.length === 2 && ID_BEARING_PREFIXES.includes(segments[0] as never)) {
    candidate = segments[1] ?? null;
  }

  if (candidate === null) return null;
  return YOUTUBE_ID_RE.test(candidate) ? candidate : null;
}

/**
 * The ONLY way a YouTube URL is ever produced. It is built from the id, on the
 * server, against a hardcoded origin — never echoed back from stored input.
 * `youtube-nocookie.com` is the privacy-preserving embed host and is the single
 * entry in the CSP's `frame-src`.
 */
export function youTubeEmbedUrl(externalId: string, options?: { start?: number }): string {
  if (!YOUTUBE_ID_RE.test(externalId)) {
    throw new Error(
      'youTubeEmbedUrl requires an 11-character YouTube id, not a URL or any other value',
    );
  }
  const url = new URL(`https://www.youtube-nocookie.com/embed/${externalId}`);
  url.searchParams.set('rel', '0');
  url.searchParams.set('modestbranding', '1');
  url.searchParams.set('playsinline', '1');
  if (typeof options?.start === 'number' && Number.isFinite(options.start) && options.start > 0) {
    url.searchParams.set('start', String(Math.floor(options.start)));
  }
  return url.toString();
}

/** Poster/`VideoObject.thumbnailUrl`. `i.ytimg.com` is the only remote img-src. */
export function youTubeThumbnailUrl(
  externalId: string,
  quality: 'hq' | 'maxres' = 'hq',
): string {
  if (!YOUTUBE_ID_RE.test(externalId)) {
    throw new Error(
      'youTubeThumbnailUrl requires an 11-character YouTube id, not a URL or any other value',
    );
  }
  const file = quality === 'maxres' ? 'maxresdefault.jpg' : 'hqdefault.jpg';
  return `https://i.ytimg.com/vi/${externalId}/${file}`;
}

/**
 * The admin pastes a URL; this schema is where it stops being a URL. The output
 * type has no `url` field at all, so nothing downstream — service, Prisma call,
 * serializer, or template — can accidentally persist or re-emit it.
 */
export const LessonVideoInputSchema = z
  .object({
    provider: VideoProviderSchema,
    url: z.string().min(1).max(2048),
    durationSeconds: z
      .number()
      .int()
      .positive()
      .max(12 * 60 * 60),
    posterKey: z.string().max(255).nullable().default(null),
  })
  .strict()
  .transform((value, ctx) => {
    if (value.provider !== 'youtube') {
      ctx.addIssue({
        code: 'custom',
        message: 'النسخة الحالية بتدعم فيديوهات يوتيوب بس',
        path: ['provider'],
      });
      return z.NEVER;
    }
    const externalId = extractYouTubeId(value.url);
    if (externalId === null) {
      ctx.addIssue({ code: 'custom', message: 'رابط يوتيوب غير صالح', path: ['url'] });
      return z.NEVER;
    }
    return {
      provider: 'youtube' as const,
      externalId,
      durationSeconds: value.durationSeconds,
      posterKey: value.posterKey,
    };
  });

export type LessonVideoInput = z.infer<typeof LessonVideoInputSchema>;
