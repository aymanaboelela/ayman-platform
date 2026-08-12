'use client';

import type { MediaAsset } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy/admin';
import { Select } from '@ayman/ui/components/select';

export interface AssetSelectProps {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  assets: readonly MediaAsset[];
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Global Constraint 18 / A12, applied to logo/favicon/OG-image slots the same
 * way it applies to the accent colour: an editor picks an EXISTING asset from
 * `/admin/media` by id, never types a URL or path. There is no free-text
 * fallback and no inline upload here — uploading lives on the media library
 * page; this is a second, constrained view onto the same rows.
 */
export function AssetSelect({ id, value, onChange, assets, ...aria }: AssetSelectProps) {
  return (
    <Select
      id={id}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      {...aria}
    >
      <option value="">{copy.admin.settings.assetNone}</option>
      {assets.map((asset) => (
        <option key={asset.id} value={asset.id}>
          {asset.filename}
        </option>
      ))}
    </Select>
  );
}
