'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { MediaAsset } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { Input } from '@ayman/ui/components/input';
import { mediaUrl } from '@ayman/ui/branding';
import { archiveMediaAction, patchMediaAltAction, restoreMediaAction } from './actions';

function AssetCard({ asset }: { asset: MediaAsset }) {
  const [altAr, setAltAr] = useState(asset.altAr ?? '');
  const [pending, setPending] = useState(false);

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
      toast.success(asset.archivedAt ? copy.admin.media.restore : copy.admin.media.archive);
    } else {
      toast.error(copy.admin.taxonomy.saveFailed);
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
            {copy.admin.media.archived}
          </Badge>
        ) : null}
      </div>
      <CardBody className="space-y-2">
        <p className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {asset.width && asset.height
            ? formatCopy(copy.admin.media.dimensions, { width: asset.width, height: asset.height })
            : null}{' '}
          · {formatCopy(copy.admin.media.sizeKb, { kb: Math.round(asset.sizeBytes / 1024) })}
        </p>
        <Input
          value={altAr}
          onChange={(event) => setAltAr(event.target.value)}
          onBlur={() => void saveAlt()}
          placeholder={copy.admin.media.altPlaceholder}
          aria-label={copy.admin.media.altLabel}
        />
        <Button type="button" variant="secondary" size="sm" onClick={() => void toggleArchive()} disabled={pending}>
          {asset.archivedAt ? copy.admin.media.restore : copy.admin.media.archive}
        </Button>
      </CardBody>
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
          {copy.admin.media.showArchived}
        </Link>
      </div>

      {assets.length === 0 ? (
        <p className="text-fg-muted">{copy.admin.media.empty}</p>
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
