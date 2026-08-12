import { z } from './zod';

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
    /**
     * OPTIONAL, and that is the whole point.
     *
     * How long a video is, is the VIDEO's property, not a fact about it the
     * instructor holds — «مدة الفيديو دي الكود اللي يعرفها، مش أنا». Leaving it
     * out is the normal case: the service asks YouTube and writes the answer.
     *
     * It stays accepted because there is exactly one case YouTube cannot
     * answer for — a video it will not serve to us at all — and refusing to
     * save the lesson at all would be worse than letting a number be typed.
     */
    durationSeconds: z
      .number()
      .int()
      .positive()
      .max(12 * 60 * 60)
      .optional(),
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
      // `null`, never `undefined`: the service branches on "did anyone state a
      // duration", and an absent key and an explicit null read the same there.
      durationSeconds: value.durationSeconds ?? null,
      posterKey: value.posterKey,
    };
  });

export type LessonVideoInput = z.infer<typeof LessonVideoInputSchema>;

/* ── Google Drive ─────────────────────────────────────────────────────────
 *
 * A lesson's «رابط» material is a plain URL, and an instructor pastes Drive
 * links into it constantly. Rendered as an anchor it takes the student out of
 * the platform, into a viewer they may not be signed into. Recognised here, it
 * becomes an embed.
 *
 * Everything the YouTube extractor's own contract says applies unchanged: this
 * PARSES and DISCARDS. It performs no network request, follows no redirect,
 * resolves no hostname, and returns nothing from the input but an id matching
 * DRIVE_ID_RE. That is what keeps the SSRF class absent rather than filtered.
 */

/**
 * Host ALLOWLIST, never a substring test — `drive.google.com.evil.example`
 * contains "drive.google.com" and is the obvious bypass of a naive check.
 */
const DRIVE_HOSTS: ReadonlySet<string> = new Set(['drive.google.com', 'docs.google.com']);

/**
 * Drive file ids are URL-safe base64 of no fixed width — 28 and 33 characters
 * are both common and Google has never documented a bound. Anchored, so a
 * segment carrying a slash or a dot cannot pass.
 */
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

/**
 * The four `/d/<id>/` products, each with its own embed path. `file` is Drive
 * proper (PDFs, images, anything uploaded); the other three are the editors.
 */
const DRIVE_KINDS = ['file', 'document', 'spreadsheets', 'presentation'] as const;
export type DriveKind = (typeof DRIVE_KINDS)[number];

export interface DriveTarget {
  kind: DriveKind;
  id: string;
}

/** Reduce a Google Drive/Docs URL to what it points at, or return null. */
export function extractDriveFileId(input: string): DriveTarget | null {
  const raw = input.trim();
  // A bare id is deliberately NOT accepted, unlike the YouTube extractor: an
  // id alone does not say which of the four products it belongs to, and
  // guessing would build an embed URL for the wrong one.
  if (raw.length === 0 || raw.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // `https://drive.google.com@evil.example/` reads as trustworthy to a human;
  // the parser puts the real host in `hostname`, and rejecting userinfo
  // outright removes the ambiguity rather than relying on that.
  if (url.username !== '' || url.password !== '') return null;
  if (!DRIVE_HOSTS.has(url.hostname.toLowerCase())) return null;

  // Already normalised by the URL parser, so `/file/d/../../x` has collapsed
  // before the split — the segments below cannot be walked.
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);

  // `/file/d/<id>/view`, `/document/d/<id>/edit`, and the two others. The `d`
  // is required: `/file/<id>` is not a URL Google produces, and accepting it
  // would mean guessing.
  const [kind, marker, id] = segments;
  if (marker !== 'd' || kind === undefined || id === undefined) return null;
  if (!DRIVE_KINDS.includes(kind as DriveKind)) return null;
  return DRIVE_ID_RE.test(id) ? { kind: kind as DriveKind, id } : null;
}

/**
 * The ONLY way a Drive embed URL is produced — built from the extracted id
 * against a hardcoded origin, never echoed back from stored input.
 *
 * `/preview` and not `/edit` or `/view`: it is the read-only viewer Google
 * intends for an iframe, and it does not offer the student the editor chrome
 * of a document they almost certainly cannot edit.
 */
export function driveEmbedUrl(target: DriveTarget): string {
  if (!DRIVE_ID_RE.test(target.id)) {
    throw new Error('driveEmbedUrl requires a Drive id, not a URL or any other value');
  }
  const host = target.kind === 'file' ? 'drive.google.com' : 'docs.google.com';
  return `https://${host}/${target.kind}/d/${target.id}/preview`;
}
