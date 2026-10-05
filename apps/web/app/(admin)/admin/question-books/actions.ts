'use server';

import { z } from '@ayman/contracts/zod';
import { revalidatePath } from '@/lib/revalidate-screen';
import { ExternalBookRowSchema, type ExternalBookRow } from '@ayman/contracts/quiz/external-books';
import { adminSend, adminSendVoid } from '@/lib/admin-api';

const CategorySchema = z.object({ id: z.string(), name: z.string() });

export type BookResult = { ok: true; book: ExternalBookRow } | { ok: false; message?: string };
export type CategoryResult = { ok: true; id: string; name: string } | { ok: false; message?: string };
export type VoidResult = { ok: true } | { ok: false; message?: string };

export async function createBookAction(title: string): Promise<BookResult> {
  try {
    const book = await adminSend('POST', '/api/admin/external-books', { title }, ExternalBookRowSchema);
    revalidatePath('/admin/question-books');
    return { ok: true, book };
  } catch {
    return { ok: false };
  }
}

export async function updateBookAction(
  bookId: string,
  patch: { title?: string; archived?: boolean; courseId?: string | null },
): Promise<BookResult> {
  try {
    const book = await adminSend(
      'PATCH',
      `/api/admin/external-books/${encodeURIComponent(bookId)}`,
      patch,
      ExternalBookRowSchema,
    );
    revalidatePath('/admin/question-books');
    revalidatePath(`/admin/question-books/${bookId}`);
    return { ok: true, book };
  } catch {
    return { ok: false };
  }
}

export async function createUnitAction(bookId: string, name: string): Promise<CategoryResult> {
  try {
    const unit = await adminSend(
      'POST',
      `/api/admin/external-books/${encodeURIComponent(bookId)}/units`,
      { name },
      CategorySchema,
    );
    revalidatePath(`/admin/question-books/${bookId}`);
    return { ok: true, ...unit };
  } catch {
    return { ok: false };
  }
}

export async function createLessonAction(bookId: string, unitId: string, name: string): Promise<CategoryResult> {
  try {
    const lesson = await adminSend(
      'POST',
      `/api/admin/external-books/${encodeURIComponent(bookId)}/units/${encodeURIComponent(unitId)}/lessons`,
      { name },
      CategorySchema,
    );
    revalidatePath(`/admin/question-books/${bookId}`);
    return { ok: true, ...lesson };
  } catch {
    return { ok: false };
  }
}

export async function renameCategoryAction(bookId: string, categoryId: string, name: string): Promise<CategoryResult> {
  try {
    const category = await adminSend(
      'PATCH',
      `/api/admin/external-books/categories/${encodeURIComponent(categoryId)}`,
      { name },
      CategorySchema,
    );
    revalidatePath(`/admin/question-books/${bookId}`);
    return { ok: true, ...category };
  } catch {
    return { ok: false };
  }
}

/** بيترفض (400) لو الوحدة/الدرس مش فاضي — نفس الرسالة بترجع زي ما هي. */
export async function deleteCategoryAction(bookId: string, categoryId: string): Promise<VoidResult> {
  try {
    await adminSendVoid('DELETE', `/api/admin/external-books/categories/${encodeURIComponent(categoryId)}`);
    revalidatePath(`/admin/question-books/${bookId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : undefined };
  }
}
