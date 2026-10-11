'use client';

import { useSyncExternalStore } from 'react';
import { actionErrorMessage } from '@/lib/stale-tab';

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
/**
 * Attempts per part before the upload gives up.
 *
 * ⚠️ Was 3, with 1.5 s and 3 s between them — about five seconds of patience.
 * «وصل ١١٪ وفشل» (2026-10-04): a 5 GB lecture died at 11% to an ordinary
 * home-internet blip, because ONE part out of hundreds lost its connection for
 * longer than that. Ten attempts on `partRetryDelayMs` ride out three
 * minutes of a flaky line, plus however long the laptop is offline, before
 * giving up — and a give-up still keeps the saved session, so «كمّل الرفع»
 * resumes from the parts already in the bucket.
 */
const PART_ATTEMPTS = 10;

/** Doubling from 2 s, capped at 30 s: 2, 4, 8, 16, 30, 30… */
export function partRetryDelayMs(attempt: number): number {
  return Math.min(30_000, 2000 * 2 ** (attempt - 1));
}

/**
 * Resolve when the browser says it is online — at once if it already is.
 *
 * A retry fired while the laptop's Wi-Fi is down fails instantly and burns an
 * attempt for nothing. Waiting for `online` spends the outage waiting rather
 * than failing, however long it lasts; the abort signal still ends it.
 */
function untilOnline(signal: AbortSignal): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('online', done);
      signal.removeEventListener('abort', done);
      resolve();
    };
    window.addEventListener('online', done);
    signal.addEventListener('abort', done);
  });
}
/** The window the speed is averaged over — long enough not to jitter. */
const SPEED_WINDOW_MS = 8000;
const SAVED_PREFIX = 'ayman:video-upload:';

export type UploadPhase = 'uploading' | 'processing' | 'error';

export interface UploadEntry {
  /**
   * The store's own key. The lecture's upload is keyed by its `lessonId`, as
   * it always was; a lesson MATERIAL's («رفع فيديو» in مواد الدرس) by its own
   * key, because one lesson can have several materials uploading at once.
   */
  key: string;
  lessonId: string;
  courseId: string;
  /** Set for a material's upload once its row exists; null for the lecture. */
  resourceId: string | null;
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

/** One lesson's upload of its OWN video, or null — never a material's. */
export function useUpload(lessonId: string): UploadEntry | null {
  return useUploads().find((entry) => entry.key === lessonId) ?? null;
}

/** Every material upload this tab is running for one lesson. */
export function useResourceUploads(lessonId: string): readonly UploadEntry[] {
  const all = useUploads();
  return all.filter((entry) => entry.lessonId === lessonId && entry.key !== lessonId);
}

function patch(key: string, change: Partial<UploadEntry>): void {
  const current = entries.get(key);
  if (current === undefined) return;
  entries.set(key, { ...current, ...change });
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

export function savedUpload(key: string): SavedUpload | null {
  try {
    const raw = window.localStorage.getItem(SAVED_PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as SavedUpload);
  } catch {
    return null;
  }
}

function save(key: string, saved: SavedUpload): void {
  try {
    window.localStorage.setItem(SAVED_PREFIX + key, JSON.stringify(saved));
  } catch {
    /* private window — resume will not be offered, the upload still runs */
  }
}

export function forgetSaved(key: string): void {
  try {
    window.localStorage.removeItem(SAVED_PREFIX + key);
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
  key: string,
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
    patch(key, {
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
          if (attempt === PART_ATTEMPTS) break;
          await new Promise((resolve) => setTimeout(resolve, partRetryDelayMs(attempt)));
          await untilOnline(signal);
          if (signal.aborted) throw error;
        }
      }
      if (lastError !== null) throw lastError;
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, parts.length)) }, () => worker()));
  return [...etags.entries()].map(([partNumber, etag]) => ({ partNumber, etag })).sort((a, b) => a.partNumber - b.partNumber);
}

/** What a session open answers — the lecture's, or a material's with its new row. */
type Opened =
  | {
      ok: true;
      session: {
        videoId: string;
        uploadId: string;
        partSizeBytes: number;
        parts: { partNumber: number; url: string }[];
        done?: { partNumber: number; etag: string }[];
        resourceId?: string;
      };
    }
  | { ok: false; message: string };

/**
 * Which row an upload fills, and how to talk to it. The transfer — parts,
 * retries, the speed, «كمّل الرفع» — is the same for the lecture and for a
 * material; only these differ.
 */
interface UploadTarget {
  key: string;
  courseId: string;
  lessonId: string;
  resourceId: string | null;
  open: () => Promise<Opened>;
  /** Where the session is remembered, once it is known (a material's id arrives with `open`). */
  savedKey: (session: Extract<Opened, { ok: true }>['session']) => string;
  complete: (
    session: Extract<Opened, { ok: true }>['session'],
    parts: { partNumber: number; etag: string }[],
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Told once, when the session is open (or could not be). */
  onOpened?: (opened: Opened) => void;
}

async function run(target: UploadTarget, file: File): Promise<void> {
  const { key, courseId } = target;
  entries.set(key, {
    key,
    lessonId: target.lessonId,
    courseId,
    resourceId: target.resourceId,
    fileName: file.name,
    phase: 'uploading',
    sent: 0,
    total: file.size,
    bytesPerSecond: null,
    secondsLeft: null,
    message: null,
  });
  emit();

  let opened: Opened;
  try {
    opened = await target.open();
  } catch (error) {
    // `open` is a Server Action (`startVideoUploadAction`/`resumeVideoUploadAction`)
    // called directly, not wrapped in its own try/catch — a tab left open across
    // a deploy throws here with Next's `UnrecognizedActionError` before this
    // function's own `try` even starts (that one only wraps the parts/complete
    // call below). «كمّل الرفع» on a stale tab used to escape uncaught straight
    // to the route's `error.tsx`. Same `actionErrorMessage` the catch below
    // already uses — one flag, one reload toast, not a crashed page.
    const message = actionErrorMessage(error, null);
    patch(key, { phase: 'error', message });
    target.onOpened?.({ ok: false, message: message ?? '' });
    return;
  }
  target.onOpened?.(opened);
  if (!opened.ok) {
    patch(key, { phase: 'error', message: opened.message });
    return;
  }

  const { session } = opened;
  if (session.resourceId !== undefined) patch(key, { resourceId: session.resourceId });
  const savedKey = target.savedKey(session);
  sessions.set(key, { videoId: session.videoId, uploadId: session.uploadId });
  save(savedKey, {
    videoId: session.videoId,
    uploadId: session.uploadId,
    courseId,
    fileName: file.name,
    size: file.size,
    lastModified: file.lastModified,
  });
  const controller = new AbortController();
  controllers.set(key, controller);

  try {
    const parts = await sendParts(key, file, session.partSizeBytes, session.parts, session.done ?? [], controller.signal);
    const completed = await target.complete(session, parts);
    if (!completed.ok) {
      patch(key, { phase: 'error', message: completed.message });
      return;
    }
    forgetSaved(savedKey);
    sessions.delete(key);
    patch(key, { phase: 'processing', sent: file.size, secondsLeft: 0 });
  } catch (error) {
    if (controller.signal.aborted) return;
    // The saved session stays: the parts that made it are in the bucket, and
    // picking the same file again resumes from them.
    patch(key, { phase: 'error', message: actionErrorMessage(error, null) });
  } finally {
    controllers.delete(key);
  }
}

/** The lecture's own video: keyed, saved and sealed by its lesson. */
function lectureTarget(courseId: string, lessonId: string, open: () => Promise<Opened>): UploadTarget {
  return {
    key: lessonId,
    courseId,
    lessonId,
    resourceId: null,
    open,
    savedKey: () => lessonId,
    complete: async (session, parts) =>
      (await actions()).completeVideoUploadAction(courseId, lessonId, {
        videoId: session.videoId,
        uploadId: session.uploadId,
        parts,
      }),
  };
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
  return run(
    lectureTarget(courseId, lessonId, async () =>
      (await actions()).startVideoUploadAction(lessonId, {
        fileName: file.name,
        sizeBytes: file.size,
        contentType,
        keepPrevious,
        encrypt,
      }),
    ),
    file,
  );
}

/** «كمّل الرفع» — the same file, after the tab lost it. */
export function resumeUpload(lessonId: string, file: File, saved: SavedUpload): Promise<void> {
  return run(
    lectureTarget(saved.courseId, lessonId, async () =>
      (await actions()).resumeVideoUploadAction(lessonId, {
        videoId: saved.videoId,
        uploadId: saved.uploadId,
        sizeBytes: file.size,
      }),
    ),
    file,
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

/** Drop a finished or failed entry from view — by its `key` (the lecture's is its lesson id). */
export function dismissUpload(key: string): void {
  if (entries.get(key)?.phase === 'uploading') return;
  entries.delete(key);
  emit();
}

/* ── «رفع فيديو» جوّه مواد الدرس ─────────────────────────────────────────
 *
 * The same transfer for a lesson MATERIAL. The difference that matters to the
 * admin: the material row is created by the session open, so once that has
 * answered there is nothing left to save — the panel can close, and the
 * corner card finishes the job.
 */

const resourceKey = (resourceId: string): string => `resource:${resourceId}`;

/** A material's saved session — `null` when this browser never started it. */
export function savedResourceUpload(resourceId: string): SavedUpload | null {
  return savedUpload(resourceKey(resourceId));
}

export function forgetSavedResource(resourceId: string): void {
  forgetSaved(resourceKey(resourceId));
}

function resourceTarget(
  key: string,
  courseId: string,
  lessonId: string,
  resourceId: string | null,
  open: () => Promise<Opened>,
  onOpened?: (opened: Opened) => void,
): UploadTarget {
  return {
    key,
    courseId,
    lessonId,
    resourceId,
    open,
    onOpened,
    savedKey: (session) => resourceKey(session.resourceId ?? resourceId ?? ''),
    complete: async (session, parts) =>
      (await actions()).completeResourceVideoUploadAction(courseId, session.resourceId ?? resourceId ?? '', {
        videoId: session.videoId,
        uploadId: session.uploadId,
        parts,
      }),
  };
}

let fresh = 0;

/**
 * «أضف مادة» with a video file: opens the session — which creates the
 * material — and keeps sending in the background. Resolves as soon as the
 * row exists (or could not be made), NOT when the upload ends: that is what
 * the caller waits on to close its form and show the new row.
 */
export function startResourceUpload(
  courseId: string,
  lessonId: string,
  file: File,
  contentType: string,
  material: { title: string; description: string | null },
): Promise<{ ok: true; resourceId: string } | { ok: false; message: string }> {
  fresh += 1;
  const key = `resource-new:${lessonId}:${Date.now()}:${fresh}`;
  return new Promise((resolve) => {
    void run(
      resourceTarget(
        key,
        courseId,
        lessonId,
        null,
        async () =>
          (await actions()).startResourceVideoUploadAction(courseId, lessonId, {
            title: material.title,
            description: material.description,
            fileName: file.name,
            sizeBytes: file.size,
            contentType,
          }),
        (opened) => {
          if (opened.ok && opened.session.resourceId !== undefined) {
            resolve({ ok: true, resourceId: opened.session.resourceId });
          } else {
            // Nothing was created, so nothing is left to show in the corner.
            entries.delete(key);
            emit();
            resolve({ ok: false, message: opened.ok ? '' : opened.message });
          }
        },
      ),
      file,
    );
  });
}

/** «كمّل الرفع» for a material, after the tab lost it. */
export function resumeResourceUpload(
  lessonId: string,
  resourceId: string,
  file: File,
  saved: SavedUpload,
): Promise<void> {
  return run(
    resourceTarget(resourceKey(resourceId), saved.courseId, lessonId, resourceId, async () =>
      (await actions()).resumeResourceVideoUploadAction(resourceId, {
        videoId: saved.videoId,
        uploadId: saved.uploadId,
        sizeBytes: file.size,
      }),
    ),
    file,
  );
}

/** «إلغاء» — the parts go, and the material with them (see the API). */
export async function cancelResourceUpload(courseId: string, resourceId: string): Promise<void> {
  const entry = [...entries.values()].find((candidate) => candidate.resourceId === resourceId);
  const key = entry?.key ?? resourceKey(resourceId);
  controllers.get(key)?.abort();
  controllers.delete(key);
  const session = sessions.get(key) ?? savedResourceUpload(resourceId);
  sessions.delete(key);
  forgetSavedResource(resourceId);
  entries.delete(key);
  emit();
  if (session !== null) {
    const { abortResourceVideoUploadAction } = await actions();
    await abortResourceVideoUploadAction(courseId, resourceId, { videoId: session.videoId, uploadId: session.uploadId });
  }
}
