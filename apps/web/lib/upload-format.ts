import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';

const c = copy.admin.lesson;

/**
 * `350 ميجا` / `1.4 جيجا` / `0.6 ميجا`. One decimal under 10 MB, because an
 * ADSL upload runs at well under one megabyte a second and «1 ميجا/ث» for
 * 0.4 would be a promise the ETA then breaks.
 */
export function formatBytes(bytes: number): string {
  const units = copy.admin.videos;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} ${units.unitGb}`;
  const mb = Math.max(0, bytes / 1e6);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} ${units.unitMb}`;
}

/** «فاضل ٤ دقيقة» — rounded the way a person says it, never to the second past a minute. */
export function formatEta(seconds: number): string {
  if (seconds < 60) return formatCopy(c.videoUploadEta, { time: formatCopy(c.videoUploadEtaSeconds, { n: Math.max(1, seconds) }) });
  if (seconds < 3600) {
    return formatCopy(c.videoUploadEta, { time: formatCopy(c.videoUploadEtaMinutes, { n: Math.ceil(seconds / 60) }) });
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return formatCopy(c.videoUploadEta, { time: formatCopy(c.videoUploadEtaHours, { h, m }) });
}

export function formatSpeed(bytesPerSecond: number): string {
  return formatCopy(c.videoUploadSpeed, { speed: formatBytes(bytesPerSecond) });
}
