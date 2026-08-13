'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { MediaAsset, MediaUsage, MediaUsageKind } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { mediaUrl } from '@ayman/ui/branding';
import { CoverCropper } from '@/components/admin/cover-cropper';
import { fileFromStorageKey } from '@/lib/asset-file';
import { replaceImage } from '@/lib/upload-client';
import {
  archiveMediaAction,
  deleteMediaAction,
  mediaUsageAction,
  patchMediaAltAction,
  refreshAfterRecropAction,
  restoreMediaAction,
} from './actions';

const c = copy.admin.media;

/**
 * `MEDIA_USAGE_KINDS` -> the Arabic the delete dialog lists.
 *
 * A `Record` over the union rather than a lookup with a fallback: adding a
 * sixth kind to the contract then fails to compile here, instead of silently
 * rendering an empty line in the one dialog whose entire job is to say what
 * will break.
 */
const USAGE_LABEL: Record<MediaUsageKind, string> = {
  brandingLogoLight: c.usageBrandingLogoLight,
  brandingLogoDark: c.usageBrandingLogoDark,
  brandingFavicon: c.usageBrandingFavicon,
  seoOgImage: c.usageSeoOgImage,
  homeBlock: c.usageHomeBlock,
};

function AssetCard({ asset }: { asset: MediaAsset }) {
  const [altAr, setAltAr] = useState(asset.altAr ?? '');
  const [pending, setPending] = useState(false);

  /** Open + the usage answer, which arrives after the dialog is already up. */
  const [confirming, setConfirming] = useState(false);
  const [usage, setUsage] = useState<MediaUsage | null>(null);
  const [checkingUsage, setCheckingUsage] = useState(false);

  const [recropFile, setRecropFile] = useState<File | null>(null);

  async function saveAlt() {
    setPending(true);
    const result = await patchMediaAltAction(asset.id, altAr.length > 0 ? altAr : null);
    setPending(false);
    if (!result.ok) toast.error(copy.admin.taxonomy.saveFailed);
  }

  async function toggleArchive() {
    setPending(true);
    const action = asset.archivedAt ? restoreMediaAction : archiveMediaAction;
    const result = await action(asset.id);
    setPending(false);
    if (result.ok) {
      toast.success(asset.archivedAt ? c.restore : c.archive);
    } else {
      toast.error(copy.admin.taxonomy.saveFailed);
    }
  }

  /**
   * Opens the dialog FIRST, then asks what uses the asset.
   *
   * The other order — await the usage check, then open — leaves the button
   * dead for as long as the round trip takes, which on a phone reads as a
   * broken button and gets tapped again. The dialog shows «بنشوف الصورة دي
   * مستخدمة فين…» while it waits, and the confirm button stays disabled until
   * the answer lands, so nothing can be destroyed before its warning exists.
   */
  async function openConfirm() {
    setConfirming(true);
    setUsage(null);
    setCheckingUsage(true);
    try {
      setUsage((await mediaUsageAction(asset.id)) ?? { usedBy: [] });
    } finally {
      setCheckingUsage(false);
    }
  }

  async function destroy() {
    setPending(true);
    const result = await deleteMediaAction(asset.id);
    setPending(false);
    setConfirming(false);
    if (result.ok) {
      toast.success(c.deleted);
    } else {
      toast.error(c.deleteFailed);
    }
  }

  /** Pulls the stored bytes back down so the cropper has something to open. */
  async function startRecrop() {
    setPending(true);
    try {
      const file = await fileFromStorageKey(asset.storageKey, asset.filename);
      if (!file) {
        toast.error(c.recropFailed);
        return;
      }
      setRecropFile(file);
    } finally {
      setPending(false);
    }
  }

  async function commitRecrop(cropped: File) {
    setRecropFile(null);
    setPending(true);
    try {
      const result = await replaceImage(asset.id, cropped);
      if (result.ok) {
        toast.success(c.recropSuccess);
        await refreshAfterRecropAction();
      } else {
        toast.error(c.recropFailed);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-square bg-surface-3">
        <Image
          src={mediaUrl(asset.storageKey)}
          alt={asset.altAr ?? ''}
          fill
          sizes="(min-width: 1024px) 200px, 33vw"
          className="object-cover"
        />
        {asset.archivedAt ? (
          <Badge tone="neutral" className="absolute end-8 top-8">
            {c.archived}
          </Badge>
        ) : null}
      </div>
      <CardBody className="space-y-2">
        <p className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {asset.width && asset.height
            ? formatCopy(c.dimensions, { width: asset.width, height: asset.height })
            : null}{' '}
          · {formatCopy(c.sizeKb, { kb: Math.round(asset.sizeBytes / 1024) })}
        </p>
        <Input
          value={altAr}
          onChange={(event) => setAltAr(event.target.value)}
          onBlur={() => void saveAlt()}
          placeholder={c.altPlaceholder}
          aria-label={c.altLabel}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => void toggleArchive()} disabled={pending}>
            {asset.archivedAt ? c.restore : c.archive}
          </Button>
          {/*
            «أعدل الصورة بعد ما أضفتها» — the crop used to be available only on
            the way IN, so a badly framed logo could not be fixed without
            uploading a second copy and re-pointing whatever used the first.
          */}
          <Button type="button" variant="secondary" size="sm" onClick={() => void startRecrop()} disabled={pending}>
            {c.recrop}
          </Button>
          {/*
            Destructive, and styled as such — but the real guard is the dialog,
            not the colour. This is the only control in the library that cannot
            be undone by pressing the button next to it.
          */}
          <Button type="button" variant="ghost" size="sm" onClick={() => void openConfirm()} disabled={pending}>
            <span className="text-[color:var(--err)]">{c.deleteForever}</span>
          </Button>
        </div>
      </CardBody>

      {/* ── The permanent-delete alert ──────────────────────────────────── */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent closeLabel={copy.admin.common.cancel} className="max-w-[30rem]">
          <DialogHeader>
            <DialogTitle>{c.deleteTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* `role="alert"` so a screen reader announces it on open — this
                sentence IS the dialog's purpose. */}
            <p role="alert" className="text-fg">
              {c.deleteWarning}
            </p>

            {checkingUsage ? (
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.deleteChecking}</p>
            ) : usage && usage.usedBy.length > 0 ? (
              <div className="rounded-[var(--r-md)] border border-[color:var(--err)] p-3">
                <p className="text-[length:var(--fs-text-sm)] text-fg">{c.deleteInUse}</p>
                <ul className="my-2 list-disc ps-5 text-[length:var(--fs-text-sm)] text-fg">
                  {usage.usedBy.map((kind) => (
                    <li key={kind}>{USAGE_LABEL[kind]}</li>
                  ))}
                </ul>
                <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.deleteInUseTail}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                // Disabled until the usage answer lands: a confirm that can be
                // pressed before its warning has rendered is not a confirm.
                disabled={pending || checkingUsage}
                onClick={() => void destroy()}
              >
                <span className="text-[color:var(--err)]">{c.deleteConfirm}</span>
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                {copy.admin.common.cancel}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Re-crop ─────────────────────────────────────────────────────── */}
      <Dialog open={recropFile !== null} onOpenChange={(open) => (open ? null : setRecropFile(null))}>
        <DialogContent closeLabel={c.cropCancel} className="max-w-[34rem]">
          <DialogHeader>
            <DialogTitle>{c.recropTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.recropHint}</p>
          {recropFile ? (
            <CoverCropper
              file={recropFile}
              // The library holds covers, logos and favicons alike, and nothing
              // here knows which this is — so the frame is the picture's own
              // and the crop is opt-in rather than a shape imposed on it.
              aspect="source"
              onCancel={() => setRecropFile(null)}
              onCropped={(cropped) => void commitRecrop(cropped)}
              // "Leave it alone" — closes without a write rather than
              // re-uploading the bytes it just downloaded.
              onUseOriginal={() => setRecropFile(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function MediaGrid({
  assets,
  includeArchived,
}: {
  assets: MediaAsset[];
  includeArchived: boolean;
}) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Link
          href={includeArchived ? '/admin/media' : '/admin/media?archived=1'}
          className="text-[length:var(--fs-text-sm)] text-accent-text underline"
        >
          {c.showArchived}
        </Link>
      </div>

      {assets.length === 0 ? (
        <p className="text-fg-muted">{c.empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </>
  );
}
