'use client';

import './design-studio.css';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Download,
  Ellipsis,
  Eye,
  FolderInput,
  FolderOpen,
  FolderPlus,
  ImageUp,
  Images,
  Palette,
  Pencil,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { designsCopy } from '@ayman/contracts/copy/designs';
import { formatCopy } from '@ayman/contracts/format';
import {
  DESIGN_FOLDER_COLORS,
  DESIGN_UPLOAD_EXT,
  MAX_DESIGN_BYTES,
  designDownloadPath,
  designPreviewPath,
  designSizeLabel,
  type DesignAsset,
  type DesignFolder,
  type DesignFolderColor,
  type DesignFolderDetail,
  type DesignStudio as Studio,
} from '@ayman/contracts/designs';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ayman/ui/components/dropdown-menu';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { cn } from '@ayman/ui/lib/cn';
import { designsApi, replaceDesign, uploadDesign, type DesignUploadFailure } from '@/lib/designs-client';

const c = designsCopy;
const ACCEPT = DESIGN_UPLOAD_EXT.map((ext) => `.${ext}`).join(',');
const FORMAT_CHIPS = ['PNG', 'JPG', 'WebP', 'AVIF'];
/** Two in flight: the network is the slow part; the server encodes one at a time anyway. */
const UPLOAD_CONCURRENCY = 2;

type JobState = 'queued' | 'uploading' | 'processing' | 'busy' | 'done' | 'error';

interface Job {
  id: string;
  name: string;
  folderId: string;
  file: File;
  progress: number;
  state: JobState;
  reason?: DesignUploadFailure;
}

const hue = (color: DesignFolderColor) => `ds-hue-${color}`;

function dimensions(asset: { width: number; height: number }) {
  return `${asset.width}×${asset.height}`;
}

/**
 * «ستوديو التصميم» — one client for both doors: the designer's own page at
 * `/studio` and the instructor's at `/admin/designs`. The server renders the
 * first screen; everything after (open a folder, upload, rename, replace,
 * move, delete) talks to the API straight from the browser, so a designer
 * dropping twenty pictures watches each one land instead of waiting on a
 * page render per file.
 *
 * `canWrite` hides the controls a session cannot use. It is not the lock —
 * every route checks `design:write` on the server.
 */
export function DesignStudio({
  initialStudio,
  initialFolder,
  canWrite,
}: {
  initialStudio: Studio;
  initialFolder: DesignFolderDetail | null;
  canWrite: boolean;
}) {
  const [studio, setStudio] = useState(initialStudio);
  const [activeId, setActiveId] = useState<string | null>(initialFolder?.folder.id ?? null);
  const [detail, setDetail] = useState<DesignFolderDetail | null>(initialFolder);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dragDepth, setDragDepth] = useState(0);
  const [folderDialog, setFolderDialog] = useState<'new' | 'edit' | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [viewing, setViewing] = useState<DesignAsset | null>(null);
  const [deleting, setDeleting] = useState<DesignAsset | null>(null);
  const [moving, setMoving] = useState<DesignAsset | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  /** Pictures whose «استبدال» is in flight, with its progress. */
  const [replacing, setReplacing] = useState<Record<string, number>>({});

  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<DesignAsset | null>(null);
  const running = useRef(0);
  /** The folder the last «open» asked for — a slower, older answer is dropped. */
  const latestFolder = useRef(activeId);

  const active = useMemo(
    () => studio.folders.find((folder) => folder.id === activeId) ?? null,
    [studio.folders, activeId],
  );

  /** One folder's numbers changed — patch the rail without refetching it. */
  const patchFolderInRail = useCallback((id: string, update: (folder: DesignFolder) => DesignFolder) => {
    setStudio((current) => ({
      ...current,
      folders: current.folders.map((folder) => (folder.id === id ? update(folder) : folder)),
    }));
  }, []);

  const refreshStudio = useCallback(async () => {
    try {
      setStudio(await designsApi.studio());
    } catch {
      // The rail keeps what it had; the next action will try again.
    }
  }, []);

  const openFolder = useCallback(async (id: string) => {
    latestFolder.current = id;
    setActiveId(id);
    setQuery('');
    setRenaming(null);
    setLoading(true);
    try {
      window.history.replaceState(null, '', `?f=${encodeURIComponent(id)}`);
    } catch {
      // iOS throws past 100 history writes in 10 s; the URL is a convenience.
    }
    try {
      const next = await designsApi.folder(id);
      if (latestFolder.current === id) setDetail(next);
    } catch {
      toast.error(c.actionFailed);
    } finally {
      if (latestFolder.current === id) setLoading(false);
    }
  }, []);

  // ── Uploads ───────────────────────────────────────────────────────────

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }, []);

  const runJob = useCallback(
    async (job: Job) => {
      updateJob(job.id, { state: 'uploading', progress: 0 });
      const outcome = await uploadDesign(
        job.folderId,
        job.file,
        (fraction) => updateJob(job.id, { progress: fraction, state: fraction >= 1 ? 'processing' : 'uploading' }),
        () => updateJob(job.id, { state: 'busy' }),
      );
      if (!outcome.ok) {
        updateJob(job.id, { state: 'error', reason: outcome.reason });
        return;
      }
      updateJob(job.id, { state: 'done', progress: 1 });
      const asset = outcome.value;
      setStudio((current) => ({
        ...current,
        usedBytes: current.usedBytes + asset.sizeBytes,
        folders: current.folders.map((folder) =>
          folder.id === asset.folderId
            ? {
                ...folder,
                assetCount: folder.assetCount + 1,
                sizeBytes: folder.sizeBytes + asset.sizeBytes,
                cover: { id: asset.id, version: asset.version },
              }
            : folder,
        ),
      }));
      setDetail((current) =>
        current && current.folder.id === asset.folderId
          ? { ...current, assets: [asset, ...current.assets] }
          : current,
      );
    },
    [updateJob],
  );

  // A tiny scheduler: whenever the queue changes, start jobs up to the limit.
  useEffect(() => {
    const waiting = jobs.filter((job) => job.state === 'queued');
    while (running.current < UPLOAD_CONCURRENCY && waiting.length > 0) {
      const next = waiting.shift()!;
      running.current += 1;
      // Marked before the await so the next pass does not start it twice.
      updateJob(next.id, { state: 'uploading' });
      void runJob(next).finally(() => {
        running.current -= 1;
        setJobs((current) => [...current]);
      });
    }
  }, [jobs, runJob, updateJob]);

  const enqueue = useCallback(
    (files: FileList | File[]) => {
      if (!activeId || !canWrite) return;
      const picked = Array.from(files).filter((file) => file.size > 0);
      if (picked.length === 0) return;
      setJobs((current) => [
        ...current,
        ...picked.map<Job>((file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          folderId: activeId,
          file,
          progress: 0,
          state: file.size > MAX_DESIGN_BYTES ? 'error' : 'queued',
          reason: file.size > MAX_DESIGN_BYTES ? 'tooLarge' : undefined,
        })),
      ]);
    },
    [activeId, canWrite],
  );

  const clearDone = () => setJobs((current) => current.filter((job) => job.state !== 'done' && job.state !== 'error'));

  // ── Picture actions ───────────────────────────────────────────────────

  function replaceAssetInView(asset: DesignAsset) {
    setDetail((current) =>
      current ? { ...current, assets: current.assets.map((row) => (row.id === asset.id ? asset : row)) } : current,
    );
  }

  async function rename(asset: DesignAsset, name: string) {
    const trimmed = name.trim();
    setRenaming(null);
    if (!trimmed || trimmed === asset.name) return;
    try {
      replaceAssetInView(await designsApi.patchAsset(asset.id, { name: trimmed }));
      toast.success(c.saved);
    } catch {
      toast.error(c.actionFailed);
    }
  }

  async function startReplace(asset: DesignAsset, file: File) {
    setReplacing((current) => ({ ...current, [asset.id]: 0 }));
    const outcome = await replaceDesign(
      asset.id,
      file,
      (fraction) => setReplacing((current) => ({ ...current, [asset.id]: fraction })),
      () => undefined,
    );
    setReplacing((current) => {
      const next = { ...current };
      delete next[asset.id];
      return next;
    });
    if (!outcome.ok) {
      toast.error(c.uploadFailed[outcome.reason]);
      return;
    }
    replaceAssetInView(outcome.value);
    void refreshStudio();
    toast.success(c.replaced);
  }

  async function removeAsset(asset: DesignAsset) {
    setDeleting(null);
    try {
      await designsApi.deleteAsset(asset.id);
      setDetail((current) =>
        current ? { ...current, assets: current.assets.filter((row) => row.id !== asset.id) } : current,
      );
      void refreshStudio();
      toast.success(c.deleted);
    } catch {
      toast.error(c.actionFailed);
    }
  }

  async function move(asset: DesignAsset, folderId: string) {
    setMoving(null);
    if (folderId === asset.folderId) return;
    try {
      await designsApi.patchAsset(asset.id, { folderId });
      setDetail((current) =>
        current ? { ...current, assets: current.assets.filter((row) => row.id !== asset.id) } : current,
      );
      void refreshStudio();
      toast.success(c.moved);
    } catch {
      toast.error(c.actionFailed);
    }
  }

  async function removeFolder(folder: DesignFolder) {
    setDeletingFolder(false);
    try {
      await designsApi.deleteFolder(folder.id);
      const remaining = studio.folders.filter((row) => row.id !== folder.id);
      setStudio((current) => ({
        ...current,
        usedBytes: Math.max(0, current.usedBytes - folder.sizeBytes),
        folders: current.folders.filter((row) => row.id !== folder.id),
      }));
      setDetail(null);
      latestFolder.current = null;
      setActiveId(null);
      if (remaining[0]) void openFolder(remaining[0].id);
      toast.success(c.deleted);
    } catch {
      toast.error(c.actionFailed);
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  const assets = detail && detail.folder.id === activeId ? detail.assets : [];
  const needle = query.trim().toLowerCase();
  const shown = needle ? assets.filter((asset) => asset.name.toLowerCase().includes(needle)) : assets;
  const usedFraction = Math.min(1, studio.usedBytes / Math.max(1, studio.quotaBytes));
  const visibleJobs = jobs.filter((job) => job.folderId === activeId);

  return (
    <div className="ds">
      <aside className="ds-rail" aria-label={c.folders}>
        <div className="ds-rail__head">
          <span className="ds-rail__title">{c.folders}</span>
          {canWrite ? (
            <Button size="sm" variant="secondary" onClick={() => setFolderDialog('new')}>
              <FolderPlus className="size-4" aria-hidden="true" />
              {c.newFolder}
            </Button>
          ) : null}
        </div>

        {studio.folders.length === 0 ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.noFolders}</p>
        ) : (
          <ul className="ds-folders">
            {studio.folders.map((folder) => (
              <li key={folder.id} className={hue(folder.color)}>
                <button
                  type="button"
                  className="ds-folder"
                  aria-current={folder.id === activeId ? 'true' : undefined}
                  onClick={() => void openFolder(folder.id)}
                >
                  <span className="ds-folder__tile" aria-hidden="true">
                    {folder.cover ? <img src={designPreviewPath(folder.cover)} alt="" loading="lazy" /> : <FolderOpen />}
                  </span>
                  <span className="ds-folder__text">
                    <span className="ds-folder__name">{folder.name}</span>
                    <span className="ds-folder__meta">
                      {formatCopy(c.assetsCount, { count: folder.assetCount })} · {designSizeLabel(folder.sizeBytes || 1)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="ds-meter" data-full={usedFraction > 0.9 ? 'true' : undefined}>
          <span>
            {c.storage} · {formatCopy(c.storageOf, {
              used: designSizeLabel(studio.usedBytes || 1),
              quota: designSizeLabel(studio.quotaBytes),
            })}
          </span>
          <span className="ds-meter__track" aria-hidden="true">
            <span className="ds-meter__fill block" style={{ inlineSize: `${Math.max(2, usedFraction * 100)}%` }} />
          </span>
          {usedFraction > 0.9 ? <span className="text-[color:var(--warn)]">{c.storageFull}</span> : null}
        </div>
      </aside>

      <section
        className={cn('ds-main', active && hue(active.color))}
        onDragEnter={(event) => {
          if (!active || !canWrite || !event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragDepth((depth) => depth + 1);
        }}
        onDragOver={(event) => {
          if (active && canWrite) event.preventDefault();
        }}
        onDragLeave={() => setDragDepth((depth) => Math.max(0, depth - 1))}
        onDrop={(event) => {
          event.preventDefault();
          setDragDepth(0);
          if (event.dataTransfer.files.length > 0) enqueue(event.dataTransfer.files);
        }}
      >
        {!active ? (
          <div className="ds-empty">
            <Images aria-hidden="true" />
            <p className="font-semibold text-fg">{studio.folders.length === 0 ? c.noFolders : c.pickFolder}</p>
            {studio.folders.length === 0 && canWrite ? (
              <>
                <p>{c.noFoldersHint}</p>
                <Button onClick={() => setFolderDialog('new')}>
                  <FolderPlus className="size-4" aria-hidden="true" />
                  {c.newFolder}
                </Button>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <header className="ds-band">
              <span className="ds-band__icon" aria-hidden="true">
                <FolderOpen className="size-5" />
              </span>
              <div className="ds-band__text">
                <h2 className="ds-band__title">{active.name}</h2>
                <p className="ds-band__meta">
                  {formatCopy(c.assetsCount, { count: active.assetCount })} ·{' '}
                  {designSizeLabel(active.sizeBytes || 1)}
                </p>
              </div>
              {canWrite ? (
                <div className="ds-band__actions">
                  <Button onClick={() => fileInput.current?.click()}>
                    <ImageUp className="size-4" aria-hidden="true" />
                    {c.upload}
                  </Button>
                  <Button variant="secondary" onClick={() => setFolderDialog('edit')}>
                    <Settings2 className="size-4" aria-hidden="true" />
                    {c.folderSettings}
                  </Button>
                </div>
              ) : null}
            </header>

            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                if (event.target.files) enqueue(event.target.files);
                event.target.value = '';
              }}
            />
            <input
              ref={replaceInput}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.target.files?.[0];
                const target = replaceTarget.current;
                event.target.value = '';
                if (file && target) void startReplace(target, file);
              }}
            />

            <div className="ds-toolbar">
              <div className="ds-toolbar__search relative">
                <Search
                  className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-fg-muted [inset-inline-start:0.75rem]"
                  aria-hidden="true"
                />
                <Input
                  value={query}
                  placeholder={c.search}
                  aria-label={c.search}
                  className="[padding-inline-start:2.25rem]"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                />
              </div>
              <div className="ds-formats">
                <span>{c.formats}</span>
                {FORMAT_CHIPS.map((chip) => (
                  <span key={chip} className="ds-chip">
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {canWrite ? (
              <button type="button" className="ds-drop" onClick={() => fileInput.current?.click()}>
                <ImageUp aria-hidden="true" />
                <span className="ds-drop__title">{c.dropHint}</span>
                <span className="text-[length:var(--fs-text-xs)]">
                  {formatCopy(c.maxSize, { size: designSizeLabel(MAX_DESIGN_BYTES) })}
                </span>
              </button>
            ) : null}

            {visibleJobs.length > 0 ? <UploadQueue jobs={visibleJobs} onClear={clearDone} /> : null}

            {loading && assets.length === 0 ? (
              <ul className="ds-grid" aria-busy="true">
                {Array.from({ length: Math.min(6, active.assetCount || 3) }, (_, index) => (
                  <li key={index} className="ds-card">
                    <div className="ds-card__thumb animate-pulse" />
                    <div className="ds-card__body">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-surface-3" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : assets.length === 0 ? (
              <div className="ds-empty">
                <Images aria-hidden="true" />
                <p>{c.emptyFolder}</p>
              </div>
            ) : shown.length === 0 ? (
              <p className="text-fg-muted">{c.noMatches}</p>
            ) : (
              <ul className="ds-grid">
                {shown.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    canWrite={canWrite}
                    canMove={studio.folders.length > 1}
                    renaming={renaming === asset.id}
                    replacing={replacing[asset.id]}
                    onView={() => setViewing(asset)}
                    onRenameStart={() => setRenaming(asset.id)}
                    onRename={(name) => void rename(asset, name)}
                    onRenameCancel={() => setRenaming(null)}
                    onReplace={() => {
                      replaceTarget.current = asset;
                      replaceInput.current?.click();
                    }}
                    onMove={() => setMoving(asset)}
                    onDelete={() => setDeleting(asset)}
                  />
                ))}
              </ul>
            )}

            {dragDepth > 0 ? <div className="ds-dropping">{c.dropHere}</div> : null}
          </>
        )}
      </section>

      <FolderDialog
        mode={folderDialog}
        folder={folderDialog === 'edit' ? active : null}
        onClose={() => setFolderDialog(null)}
        onCreated={(folder) => {
          setStudio((current) => ({ ...current, folders: [...current.folders, folder] }));
          setDetail({ folder, assets: [] });
          latestFolder.current = folder.id;
          setActiveId(folder.id);
          try {
            window.history.replaceState(null, '', `?f=${encodeURIComponent(folder.id)}`);
          } catch {
            // See `openFolder`.
          }
        }}
        onSaved={(folder) => patchFolderInRail(folder.id, () => folder)}
        onDelete={() => {
          setFolderDialog(null);
          setDeletingFolder(true);
        }}
      />

      <Dialog open={deletingFolder && active !== null} onOpenChange={(open) => (open ? null : setDeletingFolder(false))}>
        <DialogContent closeLabel={c.close} className="max-w-[30rem]">
          <DialogHeader>
            <DialogTitle>{formatCopy(c.deleteFolderTitle, { name: active?.name ?? '' })}</DialogTitle>
            <DialogDescription>
              {active && active.assetCount > 0
                ? formatCopy(c.deleteFolderBody, { count: active.assetCount })
                : c.deleteFolderEmpty}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingFolder(false)}>
              {c.cancel}
            </Button>
            <Button variant="danger" onClick={() => active && void removeFolder(active)}>
              <Trash2 className="size-4" aria-hidden="true" />
              {c.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => (open ? null : setDeleting(null))}>
        <DialogContent closeLabel={c.close} className="max-w-[30rem]">
          <DialogHeader>
            <DialogTitle>{formatCopy(c.deleteTitle, { name: deleting?.name ?? '' })}</DialogTitle>
            <DialogDescription>{c.deleteBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {c.cancel}
            </Button>
            <Button variant="danger" onClick={() => deleting && void removeAsset(deleting)}>
              <Trash2 className="size-4" aria-hidden="true" />
              {c.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MoveDialog
        asset={moving}
        folders={studio.folders}
        onClose={() => setMoving(null)}
        onMove={(asset, folderId) => void move(asset, folderId)}
      />

      <Viewer asset={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function UploadQueue({ jobs, onClear }: { jobs: Job[]; onClear: () => void }) {
  const finished = jobs.filter((job) => job.state === 'done' || job.state === 'error').length;
  const label: Record<JobState, string> = {
    queued: c.queued,
    uploading: c.uploading,
    processing: c.processing,
    busy: c.retrying,
    done: c.done,
    error: c.uploadFailed.failed,
  };
  return (
    <div className="ds-queue" aria-live="polite">
      <div className="ds-queue__head">
        <span>
          {c.queueTitle} · <span className="ds-latin">{finished}/{jobs.length}</span>
        </span>
        {finished > 0 ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            {c.clearDone}
          </Button>
        ) : null}
      </div>
      <ul className="ds-queue__list">
        {jobs.map((job) => (
          <li key={job.id} className="ds-job" data-state={job.state}>
            <span className="ds-job__name ds-latin">{job.name}</span>
            <span className="ds-job__state">
              {job.state === 'error' && job.reason ? c.uploadFailed[job.reason] : label[job.state]}
            </span>
            <span className="ds-job__bar" aria-hidden="true">
              <span
                style={{
                  inlineSize: `${job.state === 'processing' || job.state === 'done' || job.state === 'error' ? 100 : Math.round(job.progress * 100)}%`,
                }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssetCard({
  asset,
  canWrite,
  canMove,
  renaming,
  replacing,
  onView,
  onRenameStart,
  onRename,
  onRenameCancel,
  onReplace,
  onMove,
  onDelete,
}: {
  asset: DesignAsset;
  canWrite: boolean;
  canMove: boolean;
  renaming: boolean;
  replacing: number | undefined;
  onView: () => void;
  onRenameStart: () => void;
  onRename: (name: string) => void;
  onRenameCancel: () => void;
  onReplace: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="ds-card">
      <button type="button" className="ds-card__thumb" onClick={onView} aria-label={`${c.view}: ${asset.name}`}>
        <img src={designPreviewPath(asset)} alt="" loading="lazy" decoding="async" />
        <span className="ds-card__badges">
          <span className="ds-chip">{asset.format.toUpperCase()}</span>
          <span className="ds-chip">{dimensions(asset)}</span>
        </span>
        {replacing !== undefined ? (
          <span className="ds-card__busy">
            {replacing >= 1 ? c.processing : `${c.uploading} ${Math.round(replacing * 100)}%`}
          </span>
        ) : null}
      </button>
      <div className="ds-card__body">
        {renaming ? (
          <RenameForm initial={asset.name} onRename={onRename} onCancel={onRenameCancel} />
        ) : (
          <p className="ds-card__name" title={asset.name}>
            {asset.name}
          </p>
        )}
        <p className="ds-card__meta">
          <span>{designSizeLabel(asset.sizeBytes)}</span>
          {asset.uploadedByName ? <span>· {formatCopy(c.byline, { name: asset.uploadedByName })}</span> : null}
        </p>
        <div className="ds-card__actions">
          <a className="ds-linkbtn" href={designDownloadPath(asset)} download>
            <Download className="size-4" aria-hidden="true" />
            {c.download}
          </a>
          {canWrite ? (
            <>
              <Button size="sm" variant="secondary" onClick={onReplace} disabled={replacing !== undefined}>
                <RefreshCw className="size-4" aria-hidden="true" />
                {c.replace}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" aria-label={c.more} className="ds-more">
                    <Ellipsis className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={onView}>
                    <Eye className="size-4" aria-hidden="true" />
                    {c.view}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onRenameStart}>
                    <Pencil className="size-4" aria-hidden="true" />
                    {c.rename}
                  </DropdownMenuItem>
                  {canMove ? (
                    <DropdownMenuItem onSelect={onMove}>
                      <FolderInput className="size-4" aria-hidden="true" />
                      {c.move}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator className="my-1 h-px bg-line" />
                  <DropdownMenuItem onSelect={onDelete} className="text-[color:var(--err)]">
                    <Trash2 className="size-4" aria-hidden="true" />
                    {c.delete}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={onView}>
              <Eye className="size-4" aria-hidden="true" />
              {c.view}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Mounted only while renaming, so it starts from the current name every time. */
function RenameForm({
  initial,
  onRename,
  onCancel,
}: {
  initial: string;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <form
      method="post"
      className="flex gap-2"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onRename(draft);
      }}
    >
      <Input
        autoFocus
        value={draft}
        maxLength={120}
        aria-label={c.rename}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      />
      <Button type="submit" size="sm">
        {c.save}
      </Button>
    </form>
  );
}

function FolderDialog({
  mode,
  folder,
  onClose,
  onCreated,
  onSaved,
  onDelete,
}: {
  mode: 'new' | 'edit' | null;
  folder: DesignFolder | null;
  onClose: () => void;
  onCreated: (folder: DesignFolder) => void;
  onSaved: (folder: DesignFolder) => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent closeLabel={c.close} className="max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>{mode === 'new' ? c.newFolder : c.folderSettings}</DialogTitle>
        </DialogHeader>
        {/* Keyed, so opening it again starts from the folder as it is now. */}
        {mode ? (
          <FolderForm
            key={`${mode}-${folder?.id ?? ''}`}
            mode={mode}
            folder={folder}
            onClose={onClose}
            onCreated={onCreated}
            onSaved={onSaved}
            onDelete={onDelete}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FolderForm({
  mode,
  folder,
  onClose,
  onCreated,
  onSaved,
  onDelete,
}: {
  mode: 'new' | 'edit';
  folder: DesignFolder | null;
  onClose: () => void;
  onCreated: (folder: DesignFolder) => void;
  onSaved: (folder: DesignFolder) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(mode === 'edit' && folder ? folder.name : '');
  const [color, setColor] = useState<DesignFolderColor>(mode === 'edit' && folder ? folder.color : 'amber');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      if (mode === 'new') {
        onCreated(await designsApi.createFolder({ name: name.trim(), color }));
      } else if (folder) {
        onSaved(await designsApi.patchFolder(folder.id, { name: name.trim(), color }));
        toast.success(c.saved);
      }
      onClose();
    } catch {
      toast.error(c.actionFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="ds-folder-name">{c.folderName}</Label>
        <Input
          id="ds-folder-name"
          value={name}
          maxLength={120}
          placeholder={c.folderNamePlaceholder}
          className="mt-1.5"
          autoFocus
          onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        />
      </div>
      <fieldset>
        <legend className="mb-2 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">
          <Palette className="size-4" aria-hidden="true" />
          {c.color}
        </legend>
        <div className="ds-swatches">
          {DESIGN_FOLDER_COLORS.map((option) => (
            <label key={option} className={cn('ds-swatch', hue(option))} title={c.colors[option]}>
              <input
                type="radio"
                name="ds-folder-color"
                value={option}
                checked={color === option}
                aria-label={c.colors[option]}
                onChange={() => setColor(option)}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <DialogFooter className="flex-wrap gap-2">
        {mode === 'edit' ? (
          <Button type="button" variant="danger" className="me-auto" onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
            {c.deleteFolder}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose}>
          {c.cancel}
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? c.saving : mode === 'new' ? c.create : c.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

function MoveDialog({
  asset,
  folders,
  onClose,
  onMove,
}: {
  asset: DesignAsset | null;
  folders: DesignFolder[];
  onClose: () => void;
  onMove: (asset: DesignAsset, folderId: string) => void;
}) {
  return (
    <Dialog open={asset !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent closeLabel={c.close} className="max-w-[26rem]">
        <DialogHeader>
          <DialogTitle>{c.move}</DialogTitle>
          <DialogDescription>{asset?.name}</DialogDescription>
        </DialogHeader>
        {asset ? (
          <MoveForm
            key={asset.id}
            folders={folders.filter((folder) => folder.id !== asset.folderId)}
            onClose={onClose}
            onMove={(folderId) => onMove(asset, folderId)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({
  folders,
  onClose,
  onMove,
}: {
  folders: DesignFolder[];
  onClose: () => void;
  onMove: (folderId: string) => void;
}) {
  const [target, setTarget] = useState(folders[0]?.id ?? '');
  return (
    <>
      <Select value={target} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTarget(event.target.value)}>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </Select>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {c.cancel}
        </Button>
        <Button disabled={!target} onClick={() => target && onMove(target)}>
          <FolderInput className="size-4" aria-hidden="true" />
          {c.move}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * The picture at the size it was drawn. The grid preview shows at once; the
 * full master swaps in when it has loaded — a 20 MB PNG should not be a blank
 * box for the seconds it takes.
 */
function Viewer({ asset, onClose }: { asset: DesignAsset | null; onClose: () => void }) {
  return (
    <Dialog open={asset !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent closeLabel={c.close} className="max-w-[min(96vw,80rem)]">
        {asset ? <ViewerBody key={`${asset.id}-${asset.version}`} asset={asset} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ asset }: { asset: DesignAsset }) {
  const [full, setFull] = useState(false);
  return (
    <div className="ds-viewer">
      <DialogHeader>
        <DialogTitle className="[overflow-wrap:anywhere]">{asset.name}</DialogTitle>
      </DialogHeader>
      <div className="ds-viewer__stage">
        <img
          src={full ? designDownloadPath(asset) : designPreviewPath(asset)}
          alt={asset.name}
          width={asset.width}
          height={asset.height}
        />
        {/* Preloads the master off-screen, then swaps. */}
        {!full ? <img src={designDownloadPath(asset)} alt="" hidden onLoad={() => setFull(true)} /> : null}
      </div>
      <div className="ds-viewer__bar">
        <span className="flex flex-wrap gap-2">
          <span className="ds-chip">{asset.format.toUpperCase()}</span>
          <span className="ds-chip">{dimensions(asset)}</span>
          <span className="ds-chip">{designSizeLabel(asset.sizeBytes)}</span>
        </span>
        <a className="ds-linkbtn" href={designDownloadPath(asset)} download>
          <Download className="size-4" aria-hidden="true" />
          {c.download}
        </a>
      </div>
    </div>
  );
}
