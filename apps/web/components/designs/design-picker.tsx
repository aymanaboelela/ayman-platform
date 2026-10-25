'use client';

import './design-studio.css';

import { useState } from 'react';
import { ArrowRight, Brush, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { designsCopy } from '@ayman/contracts/copy/designs';
import { formatCopy } from '@ayman/contracts/format';
import {
  designPreviewPath,
  type DesignFolderDetail,
  type DesignPublishShape,
  type DesignStudio,
} from '@ayman/contracts/designs';
import type { MediaAsset } from '@ayman/contracts/admin/media';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { designsApi } from '@/lib/designs-client';

const c = designsCopy.picker;

/**
 * «من التصميمات» — beside «اختار صورة» on every cover field.
 *
 * Picking a design PUBLISHES it: the API cuts a copy to the field's own frame
 * (16/9, round, or the 3/4 jacket) at up to 2560px, q90, and hands back a
 * library image whose storage key the field stores exactly as if it had been
 * uploaded. No crop dialog — the designer drew it at the size it is meant
 * for, and a re-crop in the browser would re-encode it at the library's
 * 1600px/q82, which is the quality loss this whole path exists to avoid.
 */
export function DesignPicker({
  shape,
  disabled,
  onPicked,
}: {
  shape: DesignPublishShape;
  disabled?: boolean;
  onPicked: (asset: MediaAsset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [studio, setStudio] = useState<DesignStudio | null>(null);
  const [folder, setFolder] = useState<DesignFolderDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    setFolder(null);
    setFailed(false);
    try {
      setStudio(await designsApi.studio());
    } catch {
      setFailed(true);
    }
  }

  async function openFolder(id: string) {
    try {
      setFolder(await designsApi.folder(id));
    } catch {
      toast.error(c.loadFailed);
    }
  }

  async function pick(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      const asset = await designsApi.publish(id, shape);
      onPicked(asset);
      toast.success(c.published);
      setOpen(false);
    } catch {
      toast.error(c.failed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => void show()}>
        <Brush className="size-4" aria-hidden="true" />
        {c.open}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? null : setOpen(false))}>
        <DialogContent closeLabel={designsCopy.close} className="max-w-[46rem]">
          <DialogHeader>
            <DialogTitle>{folder ? folder.folder.name : c.title}</DialogTitle>
            <DialogDescription>{c.lead}</DialogDescription>
          </DialogHeader>

          <div className="ds-picker">
            {failed ? (
              <p role="alert" className="text-[color:var(--err)]">
                {c.loadFailed}
              </p>
            ) : studio === null ? (
              <p className="text-fg-muted">{c.publishing}</p>
            ) : folder ? (
              <>
                <div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFolder(null)}>
                    <ArrowRight className="size-4" aria-hidden="true" />
                    {c.back}
                  </Button>
                </div>
                {folder.assets.length === 0 ? (
                  <p className="text-fg-muted">{designsCopy.emptyFolder}</p>
                ) : (
                  <ul className="ds-picker__grid">
                    {folder.assets.map((asset) => (
                      <li key={asset.id}>
                        <button
                          type="button"
                          className="ds-pick"
                          aria-busy={busy === asset.id ? 'true' : undefined}
                          disabled={busy !== null}
                          onClick={() => void pick(asset.id)}
                        >
                          <span className="ds-pick__thumb">
                            <img src={designPreviewPath(asset)} alt="" loading="lazy" />
                          </span>
                          <span className="ds-pick__name">
                            {busy === asset.id ? c.publishing : asset.name}
                          </span>
                          <span className="ds-chip justify-self-start">
                            {asset.width}×{asset.height}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : studio.folders.length === 0 ? (
              <p className="text-fg-muted">{c.empty}</p>
            ) : (
              <ul className="ds-picker__grid">
                {studio.folders.map((row) => (
                  <li key={row.id} className={cn(`ds-hue-${row.color}`)}>
                    <button type="button" className="ds-pick" onClick={() => void openFolder(row.id)}>
                      <span className="ds-pick__thumb ds-pick__thumb--folder">
                        {row.cover ? <img src={designPreviewPath(row.cover)} alt="" loading="lazy" /> : <FolderOpen />}
                      </span>
                      <span className="ds-pick__name">{row.name}</span>
                      <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                        {formatCopy(designsCopy.assetsCount, { count: row.assetCount })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
