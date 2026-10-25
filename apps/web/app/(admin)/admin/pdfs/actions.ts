'use server';

import { updateTag } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import {
  AdminPdfDetailSchema,
  AdminPdfRowSchema,
  type PdfCreate,
  type PdfPatch,
} from '@ayman/contracts/pdfs';
import { adminSend } from '@/lib/admin-api';
import { TAG_NEWS, TAG_PDFS } from '@/lib/cache-tags';
import { submitToIndexNow } from '@/lib/seo/indexnow';

/**
 * «ملفات PDF» writes. Every one invalidates BOTH tags: an article carries a PDF
 * card, so renaming or unpublishing a PDF changes article pages too.
 *
 * A published write is pushed to IndexNow — «يظهر في نتايج البحث دايمًا» is
 * the point of the section, and waiting for a crawler to wander by is the slow
 * way. `after()` so the push outlives the action's request; it never throws.
 */
function invalidate(): void {
  updateTag(TAG_PDFS);
  updateTag(TAG_NEWS);
}

function announce(row: { slug: string; status: string }): void {
  if (row.status !== 'published') return;
  after(() => submitToIndexNow([`/pdfs/${row.slug}`, '/pdfs']));
}

export async function createPdf(input: PdfCreate) {
  const row = await adminSend('POST', '/api/admin/pdfs', input, AdminPdfRowSchema);
  invalidate();
  return row;
}

export async function patchPdf(id: string, input: PdfPatch) {
  const detail = await adminSend('PATCH', `/api/admin/pdfs/${encodeURIComponent(id)}`, input, AdminPdfDetailSchema);
  invalidate();
  announce(detail);
  return detail;
}

export async function setPdfPublished(id: string, isPublished: boolean) {
  const row = await adminSend(
    'PATCH',
    `/api/admin/pdfs/${encodeURIComponent(id)}/published`,
    { isPublished },
    AdminPdfRowSchema,
  );
  invalidate();
  announce(row);
  return row;
}

export async function deletePdf(id: string) {
  await adminSend('DELETE', `/api/admin/pdfs/${encodeURIComponent(id)}`, undefined, z.object({ ok: z.boolean() }));
  invalidate();
}
