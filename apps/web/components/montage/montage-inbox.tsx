'use client';

import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clapperboard,
  CloudUpload,
  Download,
  Film,
  FolderInput,
  Pause,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { montageCopy } from '@ayman/contracts/copy/montage';
import { formatCopy } from '@ayman/contracts/format';
import {
  MAX_MONTAGE_BYTES,
  MONTAGE_NOTE_MAX,
  MONTAGE_TITLE_MAX,
  type MontageEditor,
  type MontageList,
  type MontageVideo,
} from '@ayman/contracts/montage';
import { UPLOAD_VIDEO_MIME } from '@ayman/contracts/video';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { montageApi, MontageRequestError } from '@/lib/montage-client';
import { formatBytes, formatEta, formatSpeed } from '@/lib/upload-format';
import {
  resumeMontageUpload,
  savedMontageUpload,
  startMontageUpload,
  stopMontageUpload,
  useMontageUploads,
  type UploadEntry,
} from '@/lib/video-upload-manager';
import { MontageEditors } from './montage-editors';
import { PublishDialog } from './publish-dialog';

const c = montageCopy;
/** «8 جيجا», the way the limit is said — not the 8.6 decimal gigabytes `formatBytes` would print. */
const MAX_LABEL = formatCopy(c.gigabytes, { n: String(Math.round(MAX_MONTAGE_BYTES / 1024 ** 3)) });
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });

/** What the bucket is told the file is — advisory; ffprobe decides at encode time. */
function contentTypeOf(file: File): string | null {
  if ((UPLOAD_VIDEO_MIME as readonly string[]).includes(file.type)) return file.type;
  if (file.type.startsWith('video/')) return 'video/mp4';
  // Windows hands `.mkv` over with no type at all.
  if (file.type === '' && /\.(mp4|m4v|mov|mkv|webm|avi|mpe?g)$/i.test(file.name)) return 'video/mp4';
  return null;
}

/** The file's name without its extension, as the first guess at a title. */
function titleOf(file: File): string {
  return (file.name.replace(/\.[^.]+$/, '').trim() || file.name).slice(0, MONTAGE_TITLE_MAX);
}

function errorText(error: unknown): string {
  if (error instanceof MontageRequestError) {
    if (error.status === 422) return c.storageOff;
    if (error.detail !== null && /[؀-ۿ]/.test(error.detail)) return error.detail;
  }
  return c.failed;
}

/**
 * «المونتاج» — one screen for both sides of the hand-over.
 *
 * The editor drops finished videos here and sees them arrive; the instructor
 * sees the same list with «نزّل» and «حطه في درس» on every row. The transfer
 * itself lives in `video-upload-manager.ts`, so it keeps going while either
 * of them moves to another screen in the same tab.
 */
export function MontageInbox({
  initial,
  canWrite,
  canPublish,
  href,
  editors,
}: {
  initial: MontageList;
  /** The editor accounts — the instructor's screen only (`montage:publish`). */
  editors?: MontageEditor[];
  canWrite: boolean;
  canPublish: boolean;
  /** This screen's own path — where the dashboard's corner card links back to. */
  href: string;
}) {
  const [list, setList] = useState(initial);
  const [query, setQuery] = useState('');
  /** Whose work the list shows — `null` is everybody's. */
  const [uploader, setUploader] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<MontageVideo | null>(null);
  const [deleting, setDeleting] = useState<MontageVideo | null>(null);
  const [publishing, setPublishing] = useState<MontageVideo | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const resumePicker = useRef<HTMLInputElement>(null);
  const resumeFor = useRef<MontageVideo | null>(null);
  const live = useMontageUploads();

  const refresh = useCallback(async () => {
    try {
      setList(await montageApi.list());
    } catch {
      /* the list on screen stays; the next action tries again */
    }
  }, []);

  const finished = useCallback(
    (name: string) => () => {
      toast.success(formatCopy(c.uploaded, { name }));
      void refresh();
    },
    [refresh],
  );

  const send = useCallback(
    async (files: readonly File[]) => {
      for (const file of files) {
        const contentType = contentTypeOf(file);
        if (contentType === null) {
          toast.error(formatCopy(c.badType, { name: file.name }));
          continue;
        }
        if (file.size > MAX_MONTAGE_BYTES) {
          toast.error(formatCopy(c.tooLarge, { name: file.name, size: MAX_LABEL }));
          continue;
        }
        const title = titleOf(file);
        const opened = await startMontageUpload(file, contentType, { title }, { href, onFinished: finished(title) });
        if (!opened.ok) {
          toast.error(opened.message);
          continue;
        }
        void refresh();
      }
    },
    [finished, href, refresh],
  );

  const resume = useCallback(
    (video: MontageVideo, file: File) => {
      const saved = savedMontageUpload(video.id);
      if (file.size !== video.sizeBytes || (saved !== null && saved.fileName !== file.name)) {
        toast.error(formatCopy(c.resumeWrongFile, { name: video.fileName }));
        return;
      }
      void resumeMontageUpload(video.id, file, { href, onFinished: finished(video.title) });
    },
    [finished, href],
  );

  const download = async (video: MontageVideo) => {
    setDownloading(video.id);
    try {
      const { url } = await montageApi.download(video.id);
      // A navigation, not a fetch: the bucket answers `attachment`, so the
      // page stays where it is and the browser saves the file.
      window.location.assign(url);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setDownloading(null);
    }
  };

  /** Everyone who has uploaded something, with how much — the filter chips. */
  const uploaders = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number }>();
    for (const video of list.videos) {
      if (video.uploadedById === null) continue;
      const entry = byId.get(video.uploadedById) ?? { id: video.uploadedById, name: video.uploadedBy ?? '—', count: 0 };
      entry.count += 1;
      byId.set(video.uploadedById, entry);
    }
    return [...byId.values()];
  }, [list.videos]);

  const visible = useMemo(() => {
    const needle = query.trim();
    return list.videos.filter(
      (video) =>
        (uploader === null || video.uploadedById === uploader) &&
        (needle === '' || video.title.includes(needle) || video.fileName.includes(needle)),
    );
  }, [list.videos, query, uploader]);

  const liveFor = (video: MontageVideo): UploadEntry | undefined => live.find((entry) => entry.montageId === video.id);
  const ready = list.videos.filter((video) => video.status === 'ready').length;

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!canWrite) return;
    void send([...event.dataTransfer.files]);
  };

  return (
    <div className="grid gap-5">
      {editors !== undefined ? <MontageEditors initial={editors} selected={uploader} onSelect={setUploader} /> : null}
      {canWrite ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'relative overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center transition-colors duration-200 sm:p-8',
            dragging
              ? 'border-accent bg-[color-mix(in_oklab,var(--a-9)_10%,var(--n-2))]'
              : 'border-[color-mix(in_oklab,var(--viz-3)_45%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--viz-3)_10%,var(--n-2)),color-mix(in_oklab,var(--viz-2)_8%,var(--n-2)))]',
          )}
        >
          <span
            aria-hidden="true"
            className="mx-auto grid size-14 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--viz-3),var(--viz-4))] text-[color:var(--ink-fg)] shadow-md"
          >
            <CloudUpload className="size-7" />
          </span>
          <p className="mt-3 text-[length:var(--fs-title-3)] font-semibold text-fg">{c.dropTitle}</p>
          <p className="mt-1 text-fg-muted">{c.dropOr}</p>
          <Button className="mt-2" onClick={() => picker.current?.click()}>
            <Film className="size-4" aria-hidden="true" />
            {c.pick}
          </Button>
          <p className="mt-3 text-[length:var(--fs-text-sm)] text-fg-muted">
            {formatCopy(c.dropHint, { size: MAX_LABEL })}
          </p>
          <p
            dir="ltr"
            className="mono mt-2 inline-block rounded-md bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted [unicode-bidi:isolate]"
          >
            {c.formats}
          </p>
          <input
            ref={picker}
            type="file"
            accept="video/*,.mkv"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void send([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
        </div>
      ) : null}

      <input
        ref={resumePicker}
        type="file"
        accept="video/*,.mkv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const video = resumeFor.current;
          event.target.value = '';
          if (file && video) resume(video, file);
        }}
      />

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{c.listTitle}</h2>
          <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">
            {formatCopy(c.total, { count: String(ready), size: formatBytes(list.totalBytes) })}
          </span>
          {list.videos.length > 3 ? (
            <label className="relative ms-auto w-full sm:w-72">
              <span className="sr-only">{c.search}</span>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.search} className="ps-9" />
            </label>
          ) : null}
        </div>

        {canPublish && uploaders.length > 1 ? (
          <div role="group" aria-label={c.filterLabel} className="flex flex-wrap gap-2">
            {[{ id: null, name: c.filterAll, count: list.videos.length }, ...uploaders].map((entry) => (
              <button
                key={entry.id ?? 'all'}
                type="button"
                aria-pressed={uploader === entry.id}
                onClick={() => setUploader(entry.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-[length:var(--fs-text-sm)] transition-colors',
                  uploader === entry.id
                    ? 'border-accent bg-accent/12 text-accent-text'
                    : 'border-line text-fg-muted hover:bg-surface-3 hover:text-fg',
                )}
              >
                {entry.name} <span className="tabular">({entry.count})</span>
              </button>
            ))}
          </div>
        ) : null}

        {list.videos.length === 0 ? (
          <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-line px-4 py-12 text-center text-fg-muted">
            <Clapperboard className="size-8" aria-hidden="true" />
            <p className="font-medium text-fg">{c.empty}</p>
            {canWrite ? <p className="text-[length:var(--fs-text-sm)]">{c.emptyEditor}</p> : null}
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-fg-muted">{c.noMatch}</p>
        ) : (
          <ul className="grid gap-3">
            {visible.map((video) => (
              <VideoRow
                key={video.id}
                video={video}
                upload={liveFor(video)}
                canWrite={canWrite}
                canPublish={canPublish}
                downloading={downloading === video.id}
                onDownload={() => void download(video)}
                onPublish={() => setPublishing(video)}
                onEdit={() => setEditing(video)}
                onDelete={() => setDeleting(video)}
                onResume={() => {
                  resumeFor.current = video;
                  toast.message(c.resumeHint);
                  resumePicker.current?.click();
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <EditDialog
        video={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setList((current) => ({ ...current, videos: current.videos.map((v) => (v.id === saved.id ? saved : v)) }));
          setEditing(null);
          toast.success(c.saved);
        }}
      />
      <DeleteDialog
        video={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => {
          stopMontageUpload(id);
          setDeleting(null);
          toast.success(c.deleted);
          void refresh();
        }}
      />
      {canPublish ? (
        <PublishDialog
          video={publishing}
          onClose={() => setPublishing(null)}
          onPublished={() => {
            setPublishing(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function VideoRow({
  video,
  upload,
  canWrite,
  canPublish,
  downloading,
  onDownload,
  onPublish,
  onEdit,
  onDelete,
  onResume,
}: {
  video: MontageVideo;
  upload: UploadEntry | undefined;
  canWrite: boolean;
  canPublish: boolean;
  downloading: boolean;
  onDownload: () => void;
  onPublish: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onResume: () => void;
}) {
  const sending = upload !== undefined && upload.phase === 'uploading';
  const stalled = video.status === 'uploading' && !sending;
  const percent =
    upload === undefined || upload.total === 0 ? 0 : Math.min(100, Math.round((upload.sent / upload.total) * 100));
  const tone = video.status === 'ready' ? (video.lesson !== null ? 'used' : 'ready') : sending ? 'sending' : 'stalled';

  return (
    <li
      className={cn(
        'rounded-xl border bg-surface-2 p-3 shadow-sm transition-colors sm:p-4',
        tone === 'stalled' ? 'border-[color-mix(in_oklab,var(--warn)_45%,var(--border))]' : 'border-line',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-xl',
            tone === 'used' && 'bg-[color-mix(in_oklab,var(--ok)_16%,var(--n-2))] text-ok',
            tone === 'ready' && 'bg-[color-mix(in_oklab,var(--viz-3)_18%,var(--n-2))] text-[color:var(--viz-3)]',
            tone === 'sending' && 'bg-accent/12 text-accent-text',
            tone === 'stalled' && 'bg-[color-mix(in_oklab,var(--warn)_16%,var(--n-2))] text-[color:var(--warn)]',
          )}
        >
          {tone === 'used' ? (
            <CheckCircle2 className="size-5" />
          ) : tone === 'sending' ? (
            <CloudUpload className="size-5" />
          ) : tone === 'stalled' ? (
            <Pause className="size-5" />
          ) : (
            <Film className="size-5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 break-words font-semibold text-fg">{video.title}</p>
            <StatusChip tone={tone} />
          </div>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            <span dir="ltr" className="mono max-w-full truncate [unicode-bidi:isolate]">
              {video.fileName}
            </span>
            <span className="tabular">{formatBytes(video.sizeBytes)}</span>
            <span>{dateFormatter.format(new Date(video.createdAt))}</span>
            {video.uploadedBy !== null ? <span>{formatCopy(c.by, { name: video.uploadedBy })}</span> : null}
          </p>
          {video.note !== null ? (
            <p className="mt-2 whitespace-pre-line rounded-lg bg-surface-3 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg">
              {video.note}
            </p>
          ) : null}
          {video.lesson !== null ? (
            <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">
              {formatCopy(c.onLesson, { lesson: video.lesson.lessonTitle, course: video.lesson.courseTitle })}
              {canPublish ? (
                <>
                  {' · '}
                  <Link href={`/admin/courses/${video.lesson.courseId}`} className="font-medium text-accent-text hover:underline">
                    {c.openLesson}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {sending ? (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[length:var(--fs-text-xs)] text-fg-muted">
            <span className="mono tabular font-semibold text-fg">{percent}%</span>
            <span className="tabular">
              {formatBytes(upload.sent)} / {formatBytes(upload.total)}
            </span>
            {upload.bytesPerSecond !== null ? (
              <span className="tabular">{formatSpeed(upload.bytesPerSecond)}</span>
            ) : null}
            {upload.secondsLeft !== null && upload.secondsLeft > 0 ? (
              <span>{formatCopy(c.remaining, { eta: formatEta(upload.secondsLeft) })}</span>
            ) : null}
          </div>
        </div>
      ) : upload?.phase === 'error' ? (
        <p className="mt-3 text-[length:var(--fs-text-sm)] text-err">{c.uploadFailed}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {video.status === 'ready' ? (
          <>
            {canPublish ? (
              <Button size="sm" onClick={onPublish}>
                <FolderInput className="size-4" aria-hidden="true" />
                {c.publish}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={onDownload} disabled={downloading}>
              <Download className="size-4" aria-hidden="true" />
              {downloading ? c.downloading : c.download}
            </Button>
          </>
        ) : null}
        {stalled && canWrite ? (
          <Button size="sm" onClick={onResume}>
            <CloudUpload className="size-4" aria-hidden="true" />
            {c.resume}
          </Button>
        ) : null}
        {canWrite ? (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden="true" />
            {c.rename}
          </Button>
        ) : null}
        {/* A video that has arrived is the instructor's to delete (`montage:publish`);
            the editor can only cancel an upload that has not finished. */}
        {canWrite && (video.status !== 'ready' || canPublish) ? (
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-err hover:text-err">
            {sending ? <X className="size-4" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
            {sending ? c.cancelUpload : c.delete}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function StatusChip({ tone }: { tone: 'used' | 'ready' | 'sending' | 'stalled' }) {
  const label = { used: c.statusUsed, ready: c.statusReady, sending: c.statusUploading, stalled: c.statusPaused }[tone];
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
        tone === 'used' && 'bg-[color-mix(in_oklab,var(--ok)_16%,var(--n-2))] text-ok',
        tone === 'ready' && 'bg-[color-mix(in_oklab,var(--viz-3)_18%,var(--n-2))] text-[color:var(--viz-3)]',
        tone === 'sending' && 'bg-accent/12 text-accent-text',
        tone === 'stalled' && 'bg-[color-mix(in_oklab,var(--warn)_16%,var(--n-2))] text-[color:var(--warn)]',
      )}
    >
      {label}
    </span>
  );
}

function EditDialog({
  video,
  onClose,
  onSaved,
}: {
  video: MontageVideo | null;
  onClose: () => void;
  onSaved: (video: MontageVideo) => void;
}) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  if (video !== null && openFor !== video.id) {
    setOpenFor(video.id);
    setTitle(video.title);
    setNote(video.note ?? '');
  }

  const save = async () => {
    if (video === null) return;
    setSaving(true);
    try {
      onSaved(await montageApi.patch(video.id, { title: title.trim(), note: note.trim() === '' ? null : note.trim() }));
      setOpenFor(null);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={video !== null}
      onOpenChange={(open) => {
        if (!open) {
          setOpenFor(null);
          onClose();
        }
      }}
    >
      <DialogContent closeLabel={c.close} className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>{c.editTitle}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="montage-title">{c.titleLabel}</Label>
            <Input
              id="montage-title"
              value={title}
              maxLength={MONTAGE_TITLE_MAX}
              placeholder={c.titlePlaceholder}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="montage-note">{c.noteLabel}</Label>
            <Textarea
              id="montage-note"
              value={note}
              rows={3}
              maxLength={MONTAGE_NOTE_MAX}
              placeholder={c.notePlaceholder}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {c.cancel}
          </Button>
          <Button onClick={() => void save()} disabled={saving || title.trim() === ''}>
            {saving ? c.saving : c.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  video,
  onClose,
  onDeleted,
}: {
  video: MontageVideo | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (video === null) return;
    setBusy(true);
    // Stop sending first: parts still in flight after the row is gone would
    // land in an upload the API has already aborted.
    stopMontageUpload(video.id);
    try {
      await montageApi.remove(video.id);
      onDeleted(video.id);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={video !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent closeLabel={c.close} className="max-w-[30rem]">
        <DialogHeader>
          <DialogTitle>{formatCopy(c.deleteTitle, { name: video?.title ?? '' })}</DialogTitle>
          <DialogDescription>{c.deleteBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {c.cancel}
          </Button>
          <Button variant="danger" onClick={() => void remove()} disabled={busy}>
            {busy ? c.deleting : c.deleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
