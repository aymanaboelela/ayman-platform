'use server';

import { revalidatePath, updateTag } from 'next/cache';
import {
  AcademicYearPatchSchema,
  GovernoratePatchSchema,
  SubjectCreateSchema,
  SubjectPatchSchema,
  SystemPatchSchema,
  TrackCreateSchema,
  TrackPatchSchema,
  type AcademicYearPatch,
  type GovernoratePatch,
  type SubjectCreate,
  type SubjectPatch,
  type SystemPatch,
  type TrackCreate,
  type TrackPatch,
} from '@ayman/contracts/admin/taxonomy';
import { z } from 'zod';
import { copy } from '@ayman/contracts';
import { adminSend } from '@/lib/admin-api';
import { tags } from '@/lib/cache-tags';

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Every write here ends the same way: `updateTag(tags.taxonomy())`, never
 * `revalidateTag` (Global Constraint 15) — the onboarding form's own read of
 * the public `/api/taxonomy` loader must see the admin's edit on THIS
 * request, not the next visitor's. `revalidatePath` additionally refreshes
 * this uncached admin screen itself.
 */
function afterWrite(): void {
  updateTag(tags.taxonomy());
  revalidatePath('/admin/taxonomy');
}

const OkSchema = z.object({ ok: z.boolean() }).passthrough();

export async function patchGovernorateAction(code: string, input: GovernoratePatch): Promise<ActionResult> {
  try {
    const body = GovernoratePatchSchema.parse(input);
    await adminSend('PATCH', `/api/admin/taxonomy/governorates/${code}`, body, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function patchSystemAction(id: string, input: SystemPatch): Promise<ActionResult> {
  try {
    const body = SystemPatchSchema.parse(input);
    await adminSend('PATCH', `/api/admin/taxonomy/systems/${id}`, body, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function patchAcademicYearAction(
  id: string,
  input: AcademicYearPatch,
): Promise<ActionResult> {
  try {
    const body = AcademicYearPatchSchema.parse(input);
    await adminSend('PATCH', `/api/admin/taxonomy/academic-years/${id}`, body, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function createTrackAction(input: TrackCreate): Promise<ActionResult> {
  try {
    const body = TrackCreateSchema.parse(input);
    await adminSend('POST', '/api/admin/taxonomy/tracks', body, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function patchTrackAction(id: string, input: TrackPatch): Promise<ActionResult> {
  try {
    const body = TrackPatchSchema.parse(input);
    await adminSend('PATCH', `/api/admin/taxonomy/tracks/${id}`, body, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function createSubjectAction(input: SubjectCreate): Promise<ActionResult> {
  try {
    const body = SubjectCreateSchema.parse(input);
    await adminSend('POST', '/api/admin/taxonomy/subjects', body, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function patchSubjectAction(id: string, input: SubjectPatch): Promise<ActionResult> {
  try {
    const body = SubjectPatchSchema.parse(input);
    await adminSend('PATCH', `/api/admin/taxonomy/subjects/${id}`, body, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function deleteSubjectAction(id: string): Promise<ActionResult> {
  try {
    await adminSend('DELETE', `/api/admin/taxonomy/subjects/${id}`, undefined, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    // A 409 means the subject is referenced by a subject offering — the
    // admin gets that fact, never a raw stack trace.
    const message =
      error instanceof Error && error.message.includes('failed with 409')
        ? copy.admin.taxonomy.subjectInUse
        : error instanceof Error
          ? error.message
          : 'unknown';
    return { ok: false, message };
  }
}
