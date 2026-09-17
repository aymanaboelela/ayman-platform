'use server';

import { revalidatePath } from 'next/cache';
import {
  AdminExpenseCreateSchema,
  AdminExpensePatchSchema,
  AdminExpenseRowSchema,
  type AdminExpenseCreateInput,
  type AdminExpensePatchInput,
} from '@ayman/contracts/admin/expenses';
import { copy } from '@ayman/contracts/copy/admin';
import { adminSend, adminSendVoid } from '@/lib/admin-api';

const c = copy.admin.expenses;

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Both admin screens that read this data, and NO cache tag.
 *
 * Unlike the book catalogue's writes, nothing here changes what a visitor sees
 * — an expense is internal, and no public page is built from one. So there is
 * no `'use cache'` entry to expire: what needs refreshing is the two Server
 * Components that fetch it uncached, and `revalidatePath` is what re-renders
 * those segments.
 *
 * The OVERVIEW is invalidated too, and that is the one that is easy to forget:
 * every write here changes «صافي الربح» on a different route, and an admin who
 * records a 9,000 EGP print run and then finds the net unchanged has no way to
 * tell a stale page from a failed save.
 */
function invalidate(): void {
  revalidatePath('/admin/finance/expenses');
  revalidatePath('/admin/finance');
}

export async function createExpenseAction(input: AdminExpenseCreateInput): Promise<ActionResult> {
  try {
    const body = AdminExpenseCreateSchema.parse(input);
    await adminSend('POST', '/api/admin/expenses', body, AdminExpenseRowSchema);
    invalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: c.saveFailed };
  }
}

export async function updateExpenseAction(
  id: string,
  input: AdminExpensePatchInput,
): Promise<ActionResult> {
  try {
    const body = AdminExpensePatchSchema.parse(input);
    await adminSend(
      'PATCH',
      `/api/admin/expenses/${encodeURIComponent(id)}`,
      body,
      AdminExpenseRowSchema,
    );
    invalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: c.saveFailed };
  }
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  try {
    // `adminSendVoid`: the route answers `{ ok: true }` and there is nothing
    // to parse into a row that no longer exists.
    await adminSendVoid('DELETE', `/api/admin/expenses/${encodeURIComponent(id)}`);
    invalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: c.removeFailed };
  }
}
