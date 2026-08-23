'use server';

import { listResponse } from '@ayman/contracts/admin/list';
import { AdminStudentRowSchema } from '@ayman/contracts/admin/students';
import {
  BroadcastResponseSchema,
  RecipientCountSchema,
  type BroadcastTarget,
} from '@ayman/contracts/outreach/broadcast';
import { adminGet, adminSend, AdminApiError } from '@/lib/admin-api';

const StudentRowsSchema = listResponse(AdminStudentRowSchema);

function targetQuery(target: BroadcastTarget): string {
  return target.type === 'all'
    ? 'type=all'
    : `type=user&userId=${encodeURIComponent(target.userId)}`;
}

export async function recipientCountAction(target: BroadcastTarget): Promise<number> {
  const result = await adminGet(
    `/api/admin/broadcast/recipient-count?${targetQuery(target)}`,
    RecipientCountSchema,
  );
  return result.count;
}

export type ResolveStudentResult =
  | { ok: true; id: string; fullName: string; contact: string }
  | { ok: false; message: string };

/**
 * Turns whatever the admin typed into exactly one student, or a reason it
 * could not — never a silent guess. `q` is the same free-text search
 * `/admin/students` itself already runs (name, email or phone), so this is
 * not a second search implementation, only a stricter reading of one result.
 */
export async function resolveStudentAction(query: string): Promise<ResolveStudentResult> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return { ok: false, message: '' };

  const result = await adminGet(
    `/api/admin/students?q=${encodeURIComponent(trimmed)}&perPage=5`,
    StudentRowsSchema,
  );

  if (result.rowCount === 0) return { ok: false, message: 'not-found' };
  if (result.rowCount > 1) return { ok: false, message: `ambiguous:${result.rowCount}` };

  const row = result.rows[0]!;
  // `email` is null for a student who registered by phone and gave no
  // address (see `AdminStudentRowSchema`) — `phone` is always present.
  return { ok: true, id: row.id, fullName: row.fullName, contact: row.email ?? row.phone };
}

export type SendBroadcastResult =
  | { ok: true; queued: number }
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; message: string };

export async function sendBroadcastAction(input: {
  body: string;
  target: BroadcastTarget;
}): Promise<SendBroadcastResult> {
  try {
    const result = await adminSend('POST', '/api/admin/broadcast', input, BroadcastResponseSchema);
    return { ok: true, queued: result.queued };
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) {
      return { ok: false, notFound: true };
    }
    return { ok: false, notFound: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
