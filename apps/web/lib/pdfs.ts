import { cacheLife, cacheTag } from 'next/cache';
import { PdfDetailSchema, PdfListSchema, type PdfDetail, type PdfList } from '@ayman/contracts/pdfs';
import { apiGet, apiGetOrNull } from '@/lib/api';
import { TAG_PDFS } from '@/lib/cache-tags';
import { IS_AYMAN } from '@/lib/tenant';

/**
 * «ملفات PDF» loaders — the same shape as `lib/news.ts`: `'use cache'`, one
 * tag, and an `OrEmpty` variant that never throws, because `next build`
 * evaluates these with no API to reach and a thrown loader takes the build
 * down. `cacheLife('minutes')` on the fallback so one failed build does not
 * pin an empty list for hours.
 *
 * Off Ayman's stack these return nothing without asking: the API 404s the
 * whole surface there anyway.
 */
export async function getPdfListOrEmpty(): Promise<PdfList> {
  'use cache';
  cacheTag(TAG_PDFS);
  if (!IS_AYMAN) {
    cacheLife('hours');
    return { pdfs: [] };
  }
  try {
    const list = await apiGet('/api/pdfs', PdfListSchema);
    cacheLife('hours');
    return list;
  } catch {
    cacheLife('minutes');
    return { pdfs: [] };
  }
}

/** Decoded then re-encoded, exactly as `newsPostPath` does, so an Arabic slug
 *  arriving already percent-encoded is not encoded twice. */
export function pdfApiPath(slug: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  return `/api/pdfs/${encodeURIComponent(decoded)}`;
}

/** The public page and the file. Relative: same origin as the page. */
export function pdfPagePath(slug: string): string {
  return `/pdfs/${encodeURIComponent(slug)}`;
}

export function pdfDownloadPath(slug: string): string {
  return `${pdfApiPath(slug)}/download`;
}

export async function getPdf(slug: string): Promise<PdfDetail | null> {
  if (!IS_AYMAN) return null;
  return getPdfByPath(pdfApiPath(slug));
}

async function getPdfByPath(path: string): Promise<PdfDetail | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(TAG_PDFS);
  return apiGetOrNull(path, PdfDetailSchema);
}
