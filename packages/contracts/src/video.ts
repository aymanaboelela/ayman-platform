import { z } from '@ayman/contracts/zod';

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
 * Whether YouTube will play a video inside OUR page — a different question from
 * whether the video exists, and the difference is what produced lectures that
 * saved cleanly and then refused to play for every student.
 *
 * - `ok` — it will embed.
 * - `blocked` — it exists and plays on youtube.com, but «السماح بالتضمين» is
 *   off. The one an instructor can fix themselves, in YouTube Studio.
 * - `unavailable` — private, deleted, age-restricted or region-blocked.
 * - `unknown` — we could not find out (a timeout, a consent wall, YouTube
 *   changing the page). Never rendered as reassurance, and never as blame.
 */
export const VideoEmbedStatusSchema = z.enum(['ok', 'blocked', 'unavailable', 'unknown']);
export type VideoEmbedStatus = z.infer<typeof VideoEmbedStatusSchema>;

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

/* ══════════════════════════════════════════════════════════════════════════
 * النسخة اللي عندنا — the self-hosted mirror
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ministry tablets block YouTube outright. Nothing client-side fixes that —
 * the player's whole fallback chain (nocookie → youtube.com → the link) is
 * three attempts at ONE host family, and a network that drops the family
 * drops all three. The only answer is to serve the bytes from an origin the
 * tablet already allows, which is ours.
 *
 * So every lecture's video is copied to our own object storage as an HLS
 * ladder and the player prefers it. YouTube stays as the fallback, exactly
 * inverting today's order.
 */

/**
 * Where a lesson's copy is in the pipeline.
 *
 * - `uploading` — an upload session is open and the bytes are still arriving
 *                 from the admin's browser. ONLY reachable for `upload`
 *                 videos, and the reason the worker cannot pick a row up
 *                 before its source object exists: a `pending` upload whose
 *                 bytes never landed would fail three times and stop, and the
 *                 admin would be told their own upload was corrupt.
 * - `pending`   — queued. Every YouTube video row starts here, including the
 *                 ones that existed before this feature.
 * - `mirroring` — a worker holds it. Not a lock (Redis is), just what the
 *                 admin screen shows.
 * - `ready`     — `master.m3u8` and every segment are in the bucket.
 * - `failed`    — the last attempt threw; `mirrorError` says what. Retried
 *                 with backoff until `MIRROR_MAX_ATTEMPTS`, then it sits
 *                 until an admin presses retry.
 * - `disabled`  — deliberately never mirrored. The escape hatch for a video
 *                 we must not copy (someone else's, or a live stream).
 */
export const VideoMirrorStatusSchema = z.enum([
  'uploading',
  'pending',
  'mirroring',
  'ready',
  'failed',
  'disabled',
]);
export type VideoMirrorStatus = z.infer<typeof VideoMirrorStatusSchema>;

/**
 * Attempts before the pipeline stops retrying on its own.
 *
 * Low on purpose. The failures worth retrying are transient (a timeout, a
 * hiccup at YouTube) and clear on the second try; the ones that are not —
 * a deleted video, an IP YouTube has decided is a bot — will not clear on
 * the fifth either, and a worker that keeps hammering them starves the
 * queue of videos that would have succeeded.
 */
export const MIRROR_MAX_ATTEMPTS = 3;

/**
 * The ceiling on one rendition, as a PIXEL BUDGET rather than a height.
 *
 * 1920×1080, but expressed as an area on purpose. A height of 1080 is the
 * obvious way to write this and it is wrong for a large share of real
 * lectures: YouTube encodes to a ladder of BITRATE tiers, and the frame it
 * produces for the tier it calls "480p" is 854×480 only when the source is
 * exactly 16:9. A lecture recorded at 2:1 — a slide deck with the camera in a
 * corner, which is most of them — comes back as 854×394, and a vertical clip
 * comes back taller than it is wide. Matching on height rejected every one of
 * those as "no H.264 available", for videos whose H.264 was right there.
 *
 * An area is orientation-agnostic and aspect-agnostic, and it is what the
 * limit actually means: no rung costing more to store or decode than 1080p
 * would.
 *
 * The ceiling itself is 1080p because that is the tallest H.264 YouTube
 * publishes — above it they serve VP9/AV1 only, which iOS Safari cannot play
 * inside HLS. Asking for more would mean a real transcode and a codec a large
 * share of Egyptian phones cannot decode.
 */
export const MIRROR_MAX_PIXELS = 1920 * 1080;

/**
 * How many rungs the ladder may have.
 *
 * Four is what YouTube itself offers below the ceiling for a typical lecture
 * (1080/720/480/360), and more would be storage spent on distinctions no
 * player would ever act on.
 */
export const MIRROR_MAX_RUNGS = 4;

/**
 * Object key prefix for one video's mirror. Everything under it — the master
 * playlist, per-variant playlists, init segments, media segments — belongs to
 * exactly this lesson's video and nothing else, so deleting a mirror is a
 * prefix delete and never has to reason about shared objects.
 *
 * Keyed by the YouTube id and not the lesson id on purpose: the same video
 * attached to two lessons is one copy in the bucket, and re-attaching a video
 * to a different lesson does not orphan bytes.
 */
export function mirrorPrefix(externalId: string): string {
  if (!isVideoExternalId(externalId)) {
    throw new Error('mirrorPrefix requires an 11-character YouTube id or a 32-character upload id');
  }
  return `v/${externalId}`;
}

/**
 * The URL the player loads. Built from the public base and the id — never
 * read back from the database, so a tampered key cannot redirect a student
 * anywhere.
 */
export function mirrorPlaylistUrl(baseUrl: string, externalId: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/${mirrorPrefix(externalId)}/master.m3u8`;
}

/**
 * The poster frame a transcode writes beside the ladder.
 *
 * An uploaded video has no `i.ytimg.com` to borrow a thumbnail from, and a
 * `<video>` with no poster is a black rectangle until the student presses play
 * — on a lecture list that reads as broken. The pipeline grabs one frame and
 * this is where it lands.
 */
export function mirrorPosterUrl(baseUrl: string, externalId: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/${mirrorPrefix(externalId)}/poster.jpg`;
}

/**
 * What the player is handed for a mirrored video.
 *
 * `maxHeight` is here so the UI can say «جودة عالية» honestly — a mirror that
 * only managed 480p because that is all YouTube had should not be announced
 * as 1080p.
 */
export const PlayerVideoMirrorSchema = z.object({
  hlsUrl: z.string().startsWith('https://'),
  maxHeight: z.number().int().positive(),
});
export type PlayerVideoMirror = z.infer<typeof PlayerVideoMirrorSchema>;

/* ══════════════════════════════════════════════════════════════════════════
 * الرفع المباشر — a lecture uploaded to us, with no YouTube anywhere
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The mirror above copies a video that already exists on YouTube. This is the
 * other half: the instructor uploads the file to us and YouTube is never
 * involved — no `yt-dlp`, no bot challenge on a datacenter IP, no video that
 * has to be public somewhere else before students here can see it.
 *
 * The two share everything downstream. An uploaded lecture lands under the
 * SAME `v/<id>/` prefix, is packaged as the SAME HLS ladder, and is played by
 * the SAME component. The only divergence is upstream — where the source
 * bytes come from, and whether packaging them is a remux or a real encode.
 */

/**
 * An upload's id: 32 lowercase hex characters.
 *
 * Deliberately a different SHAPE from a YouTube id rather than a different
 * column, so one glance at `external_id` — in a log line, in psql, in an
 * object key — says which pipeline produced it, and so both can share the
 * `v/<id>/` namespace with no chance of collision. 128 bits because the id
 * is the object key: guessing one is the only way to reach a lecture's bytes
 * without a session, and the bucket is public by necessity.
 */
export const UPLOAD_ID_RE = /^[0-9a-f]{32}$/;

/** Either shape — what may legally appear in `lesson_videos.external_id`. */
export function isVideoExternalId(value: string): boolean {
  return YOUTUBE_ID_RE.test(value) || UPLOAD_ID_RE.test(value);
}

/**
 * Where the ORIGINAL file sits while it waits to be packaged.
 *
 * Outside `v/`, because everything under `v/` is served to students with a
 * one-year immutable cache and the master file is neither. It is deleted the
 * moment the ladder is `ready` — keeping it would double the storage bill to
 * hold a file whose only reader is a transcode that has already run.
 */
export function uploadSourceKey(uploadId: string): string {
  if (!UPLOAD_ID_RE.test(uploadId)) {
    throw new Error('uploadSourceKey requires a 32-character upload id');
  }
  return `raw/${uploadId}/source`;
}

/**
 * The ladder an upload is encoded to, tallest first.
 *
 * FIXED heights here, unlike the mirror — and the difference is not an
 * inconsistency. The mirror takes whatever YouTube already published and must
 * not assume 16:9, because YouTube fits the source aspect inside a bitrate
 * tier and a 2:1 lecture's "480p" is 854×394. Here WE choose the frame, so
 * the height is ours to fix and the width follows from the source aspect
 * (`scale=-2:h`, even width, no letterboxing, no stretching).
 *
 * Four rungs, and every one of them earns its place on an Egyptian mobile
 * network: 360p is what plays on 3G at the back of a classroom, and 1080p is
 * what a slide full of code needs to be readable at all.
 *
 * The bitrates are H.264 High-profile targets for screen-and-speaker content,
 * which is what a lecture is — largely static frames with sharp text. They are
 * deliberately below the usual "web video" numbers for the same heights: those
 * are chosen for motion, and spending them here buys nothing a student can see.
 */
export interface LadderRung {
  readonly height: number;
  /** Video bitrate target, kbit/s. */
  readonly videoKbps: number;
  /** Ceiling for the rate control, kbit/s. Head-room for a busy scene. */
  readonly maxKbps: number;
  readonly audioKbps: number;
}

export const UPLOAD_LADDER: readonly LadderRung[] = [
  { height: 1080, videoKbps: 3200, maxKbps: 4200, audioKbps: 128 },
  { height: 720, videoKbps: 1800, maxKbps: 2400, audioKbps: 128 },
  { height: 480, videoKbps: 900, maxKbps: 1200, audioKbps: 96 },
  { height: 360, videoKbps: 500, maxKbps: 700, audioKbps: 64 },
];

/**
 * Rungs for a source of a given height — never any TALLER than the source.
 *
 * Upscaling is the one thing an encoder can do that makes a file bigger and
 * the picture no better, and it is the default outcome of a fixed ladder: a
 * 720p camera export would otherwise be published with a 1080p rung that costs
 * double and carries the same detail, and every player with the bandwidth for
 * it would pick exactly that one.
 *
 * A source shorter than the bottom rung keeps ONE rung at its own height, so a
 * 240p archive recording still plays rather than being rejected for being
 * small.
 */
export function ladderFor(sourceHeight: number): readonly LadderRung[] {
  const fits = UPLOAD_LADDER.filter((rung) => rung.height <= sourceHeight);
  if (fits.length > 0) return fits.slice(0, MIRROR_MAX_RUNGS);
  const smallest = UPLOAD_LADDER[UPLOAD_LADDER.length - 1] as LadderRung;
  return [{ ...smallest, height: Math.max(2, Math.floor(sourceHeight / 2) * 2) }];
}

/**
 * The largest file the upload endpoint will open a session for.
 *
 * 8 GB is roughly a four-hour 1080p camera export — well past any single
 * lecture — and the number exists because the transcode needs the source AND
 * its own output on the API container's disk at the same time. A file that
 * fits here but not there fails after the admin has spent an hour uploading
 * it, which is the worst possible moment to find out.
 */
export const MAX_UPLOAD_VIDEO_BYTES = 8 * 1024 * 1024 * 1024;

/**
 * Container types worth accepting. Checked at the session endpoint so a
 * mistaken PDF is refused in the first second rather than after the upload.
 *
 * Advisory, not a security control: the browser states this, and `ffprobe` is
 * what actually decides whether the bytes are a video. Nothing downstream
 * trusts it.
 */
export const UPLOAD_VIDEO_MIME = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
] as const;

/**
 * How the file is cut into parts for the browser to send.
 *
 * S3 multipart allows 10,000 parts; we aim for at most 100. Not for a limit —
 * for the RESPONSE: every part needs its own presigned URL, and a thousand of
 * them is a megabyte of JSON before a single byte of video has moved. 100
 * parts of a 2 GB lecture is 21 MB each, which is also about as much as is
 * worth re-sending when one part fails on a flaky connection.
 *
 * The 5 MB floor is S3's own minimum for any part but the last.
 */
export const UPLOAD_MIN_PART_BYTES = 5 * 1024 * 1024;
export const UPLOAD_TARGET_PARTS = 100;

export function uploadPartSize(sizeBytes: number): number {
  const even = Math.ceil(sizeBytes / UPLOAD_TARGET_PARTS);
  return Math.max(UPLOAD_MIN_PART_BYTES, Math.ceil(even / (1024 * 1024)) * 1024 * 1024);
}

export function uploadPartCount(sizeBytes: number): number {
  return Math.max(1, Math.ceil(sizeBytes / uploadPartSize(sizeBytes)));
}
