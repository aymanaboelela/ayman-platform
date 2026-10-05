import { z } from '@ayman/contracts/zod';

/**
 * «انشر المسودات» — publishing the bank's drafts in bulk.
 *
 * A paste can land as `draft` (`POST /api/admin/questions/bulk` with
 * `status: 'draft'`) so the owner reads generated wordings before any student
 * does. Publishing them one by one was the only way out, and a few thousand
 * variants is not something anyone presses «انشر» on one at a time.
 *
 * Two scopes, never both:
 *
 *   { categoryId }   every draft in that category still in the bank — what
 *                    «انشر كل مسودات التصنيف ده» sends.
 *   { versionIds }   exactly these versions — «انشر المحدد». An id that is not
 *                    a draft any more (already published, archived, unknown)
 *                    publishes nothing and is not an error: the list the admin
 *                    ticked from may be a minute old.
 *
 * Every draft goes through the SAME `publish()` the single button uses — the
 * stored rows re-validated, one audit row each — so a bulk publish cannot make
 * `ready` anything the single button would have refused. One that fails comes
 * back in `failed` and stays a draft; the rest are published regardless.
 *
 * Its own subpath, not a new export on an existing module: a tab left open on
 * the previous build keeps its Turbopack module ids, and an export added to a
 * module it already loaded is the thing that breaks it.
 */

/** One request at most — ten pages of the bank, far past one screen's ticks. */
export const PUBLISH_DRAFTS_MAX = 500;

/**
 * Question versions and categories are Postgres `uuid(7)`s — not user ids,
 * which are nanoids.
 *
 * One object with exactly one of the two keys rather than a `z.union`: Nest's
 * DTO is a class that `extends` the schema's type, and a class cannot extend a
 * union. The refine is what keeps "both" and "neither" a 400 — a body with
 * both would otherwise have to pick one silently.
 */
export const PublishDraftsRequestSchema = z
  .object({
    categoryId: z.uuid().optional(),
    versionIds: z.array(z.uuid()).min(1).max(PUBLISH_DRAFTS_MAX).optional(),
  })
  .strict()
  .refine((body) => (body.categoryId === undefined) !== (body.versionIds === undefined), {
    message: 'categoryId or versionIds — exactly one',
  });
export type PublishDraftsRequest = z.infer<typeof PublishDraftsRequestSchema>;

export const PublishDraftsFailureSchema = z.object({
  versionId: z.string(),
  /** So the result can link «افتح وصلّحه» — the edit page is keyed by the entry. */
  bankEntryId: z.string(),
  /** Why the stored question would not validate, in the form's own words. */
  message: z.string(),
});
export type PublishDraftsFailure = z.infer<typeof PublishDraftsFailureSchema>;

export const PublishDraftsResultSchema = z.object({
  published: z.number().int().min(0),
  failed: z.array(PublishDraftsFailureSchema),
});
export type PublishDraftsResult = z.infer<typeof PublishDraftsResultSchema>;
