'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ALLOWED_UPLOAD_EXT, type MediaAsset } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { mediaUrl } from '@ayman/ui/branding';
import { fileFromStorageKey } from '@/lib/asset-file';
import { replaceImage, uploadImage, type UploadFailure } from '@/lib/upload-client';
import { CoverCropper } from './cover-cropper';

const c = copy.admin.media;
const s = copy.admin.settings;

const ACCEPT = ALLOWED_UPLOAD_EXT.map((ext) => `.${ext}`).join(',');

/**
 * The frame each slot crops to, named rather than passed as a bare number so a
 * caller cannot quietly ask for a shape no surface renders.
 *
 * `favicon` is square because every place a browser paints one — the tab, a
 * bookmark, an Android home screen — is square, and an oblong icon is
 * letterboxed by the browser with no say from us. `share` is 1.91:1, which is
 * Facebook's `og:image` spec and what WhatsApp, Telegram and X all follow.
 * `logo` is `'source'`: a wordmark has no canonical ratio, and forcing one
 * would either pad it or cut it off.
 */
const SLOT_ASPECT = {
  favicon: 1,
  share: 1.91,
  logo: 'source',
} as const;

export type AssetSlot = keyof typeof SLOT_ASPECT;

/** The closed set of upload failures, in Arabic an instructor can act on. */
function uploadReason(reason: UploadFailure): string {
  if (reason === 'tooLarge') return c.uploadTooLarge;
  if (reason === 'badType') return c.uploadBadType;
  if (reason === 'unreadable') return c.uploadUnreadable;
  if (reason === 'network') return c.uploadNetwork;
  return c.uploadFailed;
}

export interface AssetPickerProps {
  id?: string;
  /** The asset ID, which is what every settings slot stores. */
  value: string | null;
  onChange: (value: string | null) => void;
  assets: readonly MediaAsset[];
  slot: AssetSlot;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Pick an image for a settings slot — and SEE it.
 *
 * ## What this replaced, and why that was not good enough
 *
 * A bare `<select>` listing filenames. Choosing a favicon meant picking
 * `IMG_4821.webp` out of a dropdown of a hundred siblings and pressing save,
 * with nothing on the page ever showing what had been chosen. Combined with
 * the resolved-key bug (`app/layout.tsx`), an admin could set the site icon,
 * see no preview, get no favicon in the tab, and have no way at all to tell
 * which of the two was wrong.
 *
 * ## Three ways in, deliberately
 *
 * Uploading and choosing from the library are genuinely different intents —
 * one is «عندي صورة جديدة», the other «الصورة اللي رفعتها امبارح» — and
 * collapsing them into one control makes the common case (the picture is
 * already there) go through a file dialog. Re-cropping is the third, and it is
 * the one that has no other home: the library page can reach it too, but the
 * moment someone notices their favicon is framed wrong is while they are
 * looking at it here.
 *
 * ## Every write refreshes the server component
 *
 * `router.refresh()` after an upload or a re-crop, because `assets` is a prop
 * from a server component. Without it the new asset is selected by id and
 * renders as «مش موجودة» until a manual reload — the value would be correct
 * and the screen would say it was broken.
 */
export function AssetPicker({
  id,
  value,
  onChange,
  assets,
  slot,
  ...aria
}: AssetPickerProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  /** Non-null only while a re-crop is open — it is what `replaceImage` targets. */
  const [recropping, setRecropping] = useState<{ asset: MediaAsset; file: File } | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = value === null ? null : (assets.find((asset) => asset.id === value) ?? null);
  const aspect = SLOT_ASPECT[slot];

  function clearPick() {
    setPicked(null);
    // Without this, choosing the SAME file again fires no `change` event, so
    // cancelling a crop and re-picking that picture does nothing at all.
    if (inputRef.current) inputRef.current.value = '';
  }

  async function commitUpload(file: File) {
    setBusy(true);
    try {
      const result = await uploadImage(file);
      if (result.ok) {
        onChange(result.value.id);
        toast.success(c.uploadSuccess);
        router.refresh();
      } else {
        toast.error(uploadReason(result.reason));
      }
    } finally {
      setBusy(false);
    }
  }

  async function commitRecrop(assetId: string, file: File) {
    setBusy(true);
    try {
      const result = await replaceImage(assetId, file);
      if (result.ok) {
        toast.success(c.recropSuccess);
        router.refresh();
      } else {
        toast.error(uploadReason(result.reason));
      }
    } finally {
      setBusy(false);
    }
  }

  /** Pulls the stored bytes back down so the cropper has something to open. */
  async function startRecrop(asset: MediaAsset) {
    setBusy(true);
    try {
      const file = await fileFromStorageKey(asset.storageKey, asset.filename);
      if (!file) {
        toast.error(c.recropFailed);
        return;
      }
      setRecropping({ asset, file });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id={id} {...aria} className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Staged, not uploaded — the crop dialog decides what actually goes.
          if (file) setPicked(file);
        }}
      />

      <div className="flex items-start gap-3">
        {/*
          A raw <img>, like every other media-origin render in this app:
          uploads are not in `next.config`'s `remotePatterns`, so the optimiser
          would reject them.

          The checkerboard behind it is not decoration — a favicon and a logo
          are usually transparent PNGs, and on a plain panel a white wordmark is
          invisible and reads as "nothing uploaded".
        */}
        <div
          className={cn(
            'relative grid shrink-0 place-items-center overflow-hidden rounded-[var(--r-md)] border border-line',
            'bg-[repeating-conic-gradient(var(--color-surface-3)_0_25%,transparent_0_50%)] bg-[length:14px_14px]',
            slot === 'favicon' ? 'size-16' : 'h-16 w-28',
          )}
        >
          {selected ? (
            <img
              src={mediaUrl(selected.storageKey)}
              alt={s.assetPreviewAlt}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="px-1 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
              {c.noImage}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {/* Names the chosen file, so «اللي فوق ده صح؟» has an answer that is
              not just a thumbnail the size of a stamp. */}
          {value !== null && selected === null ? (
            <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
              {s.assetMissing}
            </p>
          ) : null}
          {selected ? (
            <p className="truncate font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
              {selected.filename}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setBrowsing(true)}
            >
              {s.assetChooseExisting}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {s.assetUploadNew}
            </Button>
            {selected ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void startRecrop(selected)}
                >
                  {busy ? c.recropLoading : c.recrop}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onChange(null)}
                >
                  {c.removeImage}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Choose from the library ─────────────────────────────────────── */}
      <Dialog open={browsing} onOpenChange={setBrowsing}>
        <DialogContent closeLabel={copy.admin.common.close} className="max-w-[40rem]">
          <DialogHeader>
            <DialogTitle>{s.assetChooseExisting}</DialogTitle>
          </DialogHeader>
          {assets.length === 0 ? (
            <p className="text-fg-muted">{c.empty}</p>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => {
                    onChange(asset.id);
                    setBrowsing(false);
                  }}
                  // `aria-pressed`, not a checkmark alone: which one is
                  // currently chosen has to survive a screen reader.
                  aria-pressed={asset.id === value}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-[var(--r-md)] border transition-colors',
                    asset.id === value ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-line-strong',
                    'bg-[repeating-conic-gradient(var(--color-surface-3)_0_25%,transparent_0_50%)] bg-[length:14px_14px]',
                  )}
                >
                  <img
                    src={mediaUrl(asset.storageKey)}
                    alt={asset.altAr ?? asset.filename}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Crop on the way in ──────────────────────────────────────────── */}
      <Dialog open={picked !== null} onOpenChange={(open) => (open ? null : clearPick())}>
        <DialogContent closeLabel={c.cropCancel} className="max-w-[34rem]">
          <DialogHeader>
            <DialogTitle>{c.cropTitle}</DialogTitle>
          </DialogHeader>
          {picked ? (
            <CoverCropper
              file={picked}
              aspect={aspect}
              onCancel={clearPick}
              onCropped={(cropped) => {
                clearPick();
                void commitUpload(cropped);
              }}
              onUseOriginal={() => {
                const original = picked;
                clearPick();
                void commitUpload(original);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Crop something already stored ───────────────────────────────── */}
      <Dialog open={recropping !== null} onOpenChange={(open) => (open ? null : setRecropping(null))}>
        <DialogContent closeLabel={c.cropCancel} className="max-w-[34rem]">
          <DialogHeader>
            <DialogTitle>{c.recropTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.recropHint}</p>
          {recropping ? (
            <CoverCropper
              file={recropping.file}
              aspect={aspect}
              onCancel={() => setRecropping(null)}
              onCropped={(cropped) => {
                const target = recropping.asset.id;
                setRecropping(null);
                void commitRecrop(target, cropped);
              }}
              // Re-cropping and then choosing «من غير قص» means "leave it
              // alone", so this closes without a write rather than re-uploading
              // the bytes it just downloaded.
              onUseOriginal={() => setRecropping(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
