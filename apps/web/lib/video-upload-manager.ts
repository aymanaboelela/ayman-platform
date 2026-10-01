'use client';

import { useSyncExternalStore } from 'react';

/*
 * The Server Actions, loaded on first USE and never at import.
 *
 * `UploadDock` mounts this module on every admin screen through the layout,
 * and `courses/actions.ts` reaches Zod and half the contracts package — a
 * static import here put all of it into the client bundle of every route
 * under `/admin` (`lib/client-barrel.test.ts` is the guard that caught it).
 * Nobody needs those bytes until they actually pick a file.
 */
const actions = () => import('@/app/(admin)/admin/courses/actions');

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «رفع الفيديو» — the upload lives HERE, not in the panel that started it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The owner's ask was «يبقى شبه يوتيوب»: a bar that says how fast and how
 * long, an upload that keeps going while you work elsewhere, and one that does
 * not start from zero after the connection drops.
 *
 * So the transfer is a module-level store rather than component state. The
 * lesson panel and the corner card (`UploadDock`) are two views of it: close
 * the panel, open another course, and the parts keep flowing and the card
 * keeps counting. Only closing the TAB stops it — the bytes are on this
 * computer, and no page can send them after it is gone. YouTube cannot either.
 *
 * What survives the tab is the session: `videoId`, `uploadId` and the file's
 * fingerprint in `localStorage`. Pick the same file again and `resume` asks
 * the bucket which parts it already has, and sends only the rest.
 *
 * ── Why XHR and not fetch ─────────────────────────────────────────────────
 * `fetch` reports no upload progress. `XMLHttpRequest` has had
 * `upload.onprogress` since before any of this.
 */

/** Parts in flight at once. Four keeps an ADSL uplink busy without starving it. */
const CONCURRENCY = 4;
/** Attempts per part before the upload gives up. */
const PART_ATTEMPTS = 3;
/** The window the speed is averaged over — long enough not to jitter. */
const SPEED_WINDOW_MS = 8000;
const SAVED_PREFIX = 'ayman:video-upload:';

export type UploadPhase = 'uploading' | 'processing' | 'error';

export interface UploadEntry {
  lessonId: string;
  courseId: string;
  fileName: string;
  phase: UploadPhase;
  sent: number;
  total: number;
  /** Bytes per second over the last few seconds, or null until there is a window. */
  bytesPerSecond: number | null;
  secondsLeft: number | null;
  message: string | null;
}

/** What a closed tab leaves behind, so the same file can pick up where it stopped. */
export interface SavedUpload {
  videoId: string;
  uploadId: string;
  courseId: string;
  fileName: string;
  size: number;
  lastModified: number;
}

/* ── the store ───────────────────────────────────────────────────────────── */

const entries = new Map<string, UploadEntry>();
const controllers = new Map<string, AbortController>();
const sessions = new Map<string, { videoId: string; uploadId: string }>();
const listeners = new Set<() => void>();
const EMPTY: readonly UploadEntry[] = [];
let snapshot: readonly UploadEntry[] = EMPTY;

function emit(): void {
  snapshot = entries.size === 0 ? EMPTY : [...entries.values()];
  for (const listener of listeners) listener();
  syncUnloadGuard();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every upload this tab knows about. */
export function useUploads(): readonly UploadEntry[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

/** One lesson's upload, or null. */
export function useUpload(lessonId: string): UploadEntry | null {
  return useUploads().find((entry) => entry.lessonId === lessonId) ?? null;
}

function patch(lessonId: string, change: Partial<UploadEntry>): void {
  const current = entries.get(lessonId);
  if (current === undefined) return;
  entries.set(lessonId, { ...current, ...change });
  emit();
}

/*
 * A browser will not let a page ask "are you sure" with its own words, but it
 * still shows its own dialog when `preventDefault` is called — an hour of
 * upload thrown away by an accidental ⌘W is worth the generic warning. Held
 * only while something is actually uploading.
 */
let guarding = false;
function warn(event: BeforeUnloadEvent): void {
  event.preventDefault();
}
function syncUnloadGuard(): void {
  const uploading = [...entries.values()].some((entry) => entry.phase === 'uploading');
  if (uploading === guarding || typeof window === 'undefined') return;
  guarding = uploading;
  if (uploading) window.addEventListener('beforeunload', warn);
  else window.removeEventListener('beforeunload', warn);
}

/* ── persistence — best effort, and never the only copy of anything ─────── */

export function savedUpload(lessonId: string): SavedUpload | null {
  try {
    const raw = window.localStorage.getItem(SAVED_PREFIX + lessonId);
    return raw === null ? null : (JSON.parse(raw) as SavedUpload);
  } catch {
    return null;
  }
}

function save(lessonId: string, saved: SavedUpload): void {
  try {
    window.localStorage.setItem(SAVED_PREFIX + lessonId, JSON.stringify(saved));
  } catch {
    /* private window — resume will not be offered, the upload still runs */
  }
}

export function forgetSaved(lessonId: string): void {
  try {
    window.localStorage.removeItem(SAVED_PREFIX + lessonId);
  } catch {
    /* nothing stored */
  }
}

/** The same file — not just the same name — or a resume would stitch two videos together. */
export function isSameFile(file: File, saved: SavedUpload): boolean {
  return file.size === saved.size && file.name === saved.fileName && file.lastModified === saved.lastModified;
}

/* ── the transfer ────────────────────────────────────────────────────────── */

/**
 * PUT one part and give back the ETag S3 needs to seal the upload.
 *
 * ⚠️ The ETag is a RESPONSE HEADER, readable cross-origin only because the
 * bucket's CORS rule exposes it. Without `ExposeHeaders: ["ETag"]` every part
 * uploads and the completion fails — see the runbook.
 */
function putPart(url: string, body: Blob, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`part failed: ${xhr.status}`));
        return;
      }
      const etag = xhr.getResponseHeader('ETag');
      if (etag === null || etag.length === 0) {
        reject(new Error('part uploaded without an ETag — check the bucket CORS rule'));
        return;
      }
      resolve(etag);
    };
    xhr.onerror = () => reject(new Error('part failed: network'));
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

async function sendParts(
  lessonId: string,
  file: File,
  partSizeBytes: number,
  parts: readonly { partNumber: number; url: string }[],
  done: readonly { partNumber: number; etag: string }[],
  signal: AbortSignal,
): Promise<{ partNumber: number; etag: string }[]> {
  const etags = new Map<number, string>(done.map((part) => [part.partNumber, part.etag]));
  const partBytes = (partNumber: number) => {
    const start = (partNumber - 1) * partSizeBytes;
    return Math.min(start + partSizeBytes, file.size) - start;
  };

  /*
   * Progress is summed from a per-part table rather than accumulated: a part
   * that fails halfway and is retried has already reported its bytes, and
   * adding them again would push the bar past 100%. The parts the bucket
   * already had count from the first frame — a resumed upload opens at 60%.
   */
  const sentPerPart = new Map<number, number>(done.map((part) => [part.partNumber, partBytes(part.partNumber)]));
  const samples: { at: number; sent: number }[] = [];

  const bump = () => {
    let sent = 0;
    for (const value of sentPerPart.values()) sent += value;
    const now = performance.now();
    samples.push({ at: now, sent });
    while (samples.length > 2 && now - samples[0]!.at > SPEED_WINDOW_MS) samples.shift();
    const first = samples[0]!;
    const span = (now - first.at) / 1000;
    const rate = span >= 1 ? Math.max(0, (sent - first.sent) / span) : null;
    patch(lessonId, {
      sent,
      bytesPerSecond: rate,
      secondsLeft: rate !== null && rate > 0 ? Math.ceil((file.size - sent) / rate) : null,
    });
  };
  bump();

  const queue = [...parts];
  const worker = async (): Promise<void> => {
    for (;;) {
      const part = queue.shift();
      if (part === undefined) return;
      const start = (part.partNumber - 1) * partSizeBytes;
      const blob = file.slice(start, Math.min(start + partSizeBytes, file.size));

      let lastError: unknown = null;
      for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt += 1) {
        try {
          const etag = await putPart(
            part.url,
            blob,
            (loaded) => {
              sentPerPart.set(part.partNumber, loaded);
              bump();
            },
            signal,
          );
          etags.set(part.partNumber, etag);
          sentPerPart.set(part.partNumber, blob.size);
          bump();
          lastError = null;
          break;
        } catch (error) {
          if (signal.aborted) throw error;
          lastError = error;
          // The bytes it reported are not on the server; the bar must not lie.
          sentPerPart.set(part.partNumber, 0);
          bump();
          // Linear back-off: a dropped connection and a momentary 503 clear in
          // seconds, and anything that does not is not going to.
          await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        }
      }
      if (lastError !== null) throw lastError;
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, parts.length)) }, () => worker()));
  return [...etags.entries()].map(([partNumber, etag]) => ({ partNumber, etag })).sort((a, b) => a.partNumber - b.partNumber);
}

async function run(
  courseId: string,
  lessonId: string,
  file: File,
  open: () => Promise<
    | {
        ok: true;
        session: {
          videoId: string;
          uploadId: string;
          partSizeBytes: number;
          parts: { partNumber: number; url: string }[];
          done?: { partNumber: number; etag: string }[];
        };
      }
    | { ok: false; message: string }
  >,
): Promise<void> {
  entries.set(lessonId, {
    lessonId,
    courseId,
    fileName: file.name,
    phase: 'uploading',
    sent: 0,
    total: file.size,
    bytesPerSecond: null,
    secondsLeft: null,
    message: null,
  });
  emit();

  const opened = await open();
  if (!opened.ok) {
    patch(lessonId, { phase: 'error', message: opened.message });
    return;
  }

  const { session } = opened;
  sessions.set(lessonId, { videoId: session.videoId, uploadId: session.uploadId });
  save(lessonId, {
    videoId: session.videoId,
    uploadId: session.uploadId,
    courseId,
    fileName: file.name,
    size: file.size,
    lastModified: file.lastModified,
  });
  const controller = new AbortController();
  controllers.set(lessonId, controller);

  try {
    const parts = await sendParts(lessonId, file, session.partSizeBytes, session.parts, session.done ?? [], controller.signal);
    const { completeVideoUploadAction } = await actions();
    const completed = await completeVideoUploadAction(courseId, lessonId, {
      videoId: session.videoId,
      uploadId: session.uploadId,
      parts,
    });
    if (!completed.ok) {
      patch(lessonId, { phase: 'error', message: completed.message });
      return;
    }
    forgetSaved(lessonId);
    sessions.delete(lessonId);
    patch(lessonId, { phase: 'processing', sent: file.size, secondsLeft: 0 });
  } catch (error) {
    if (controller.signal.aborted) return;
    // The saved session stays: the parts that made it are in the bucket, and
    // picking the same file again resumes from them.
    patch(lessonId, { phase: 'error', message: error instanceof Error ? error.message : null });
  } finally {
    controllers.delete(lessonId);
  }
}

/** A fresh upload. The caller has already refused wrong types and oversized files. */
export function startUpload(
  courseId: string,
  lessonId: string,
  file: File,
  contentType: string,
  /** The video this one replaces: keep it in «محفوظة», or delete it for good. */
  keepPrevious = true,
  /** AES-128-encrypt the mirrored copy — «مينفعش حد ينزّل الفيديو». */
  encrypt = true,
): Promise<void> {
  return run(courseId, lessonId, file, async () =>
    (await actions()).startVideoUploadAction(lessonId, {
      fileName: file.name,
      sizeBytes: file.size,
      contentType,
      keepPrevious,
      encrypt,
    }),
  );
}

/** «كمّل الرفع» — the same file, after the tab lost it. */
export function resumeUpload(lessonId: string, file: File, saved: SavedUpload): Promise<void> {
  return run(saved.courseId, lessonId, file, async () =>
    (await actions()).resumeVideoUploadAction(lessonId, {
      videoId: saved.videoId,
      uploadId: saved.uploadId,
      sizeBytes: file.size,
    }),
  );
}

/**
 * Stop, and tell the API — so the parts are thrown away and whatever video
 * this was replacing comes back.
 */
export async function cancelUpload(courseId: string, lessonId: string): Promise<void> {
  controllers.get(lessonId)?.abort();
  controllers.delete(lessonId);
  const session = sessions.get(lessonId) ?? savedUpload(lessonId);
  sessions.delete(lessonId);
  forgetSaved(lessonId);
  entries.delete(lessonId);
  emit();
  if (session !== null) {
    const { abortVideoUploadAction } = await actions();
    await abortVideoUploadAction(courseId, lessonId, { videoId: session.videoId, uploadId: session.uploadId });
  }
}

/** Drop a finished or failed entry from view. */
export function dismissUpload(lessonId: string): void {
  if (entries.get(lessonId)?.phase === 'uploading') return;
  entries.delete(lessonId);
  emit();
}
