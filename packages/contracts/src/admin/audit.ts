import { z } from '@ayman/contracts/zod';

/**
 * The closed list of auditable actions. Closed on purpose: a free-text action
 * column becomes unqueryable within a month, and the audit viewer's filter
 * needs a finite set.
 *
 * RECONCILED: Plan 6 owns this list IN FULL, including the actions belonging to
 * the content and quiz domains. Plans 3–5 ship before the audit log exists and
 * therefore call nothing; the retrofit step wires `AuditService.record()` into
 * the services they created. Adding entries here without wiring the call site
 * is what produces an audit log that looks complete and is not.
 */
export const AUDIT_ACTIONS = [
  // content (Plan 3, instrumented by the Task 3 retrofit)
  'course:create',
  'course:update',
  'course:publish',
  'course:unpublish',
  'course:delete',
  'section:update',
  'section:reorder',
  'lesson:create',
  'lesson:update',
  'lesson:reorder',
  'lesson:delete',
  'enrollment:override',
  // quiz (Plan 5, instrumented by the Task 3 retrofit)
  'question:publish',
  'quiz:publish',
  'quiz:answer-edit',
  // platform configuration (Plan 6)
  'settings:update',
  'branding:update',
  'flag:update',
  'nav:create',
  'nav:update',
  'nav:archive',
  'nav:restore',
  'nav:reorder',
  'home-block:create',
  'home-block:update',
  'home-block:archive',
  'home-block:restore',
  'home-block:reorder',
  'home-block:publish',
  'home-block:unpublish',
  'media:upload',
  'media:archive',
  'media:restore',
  /**
   * PERMANENT delete — the row and the bytes, unlike `media:archive`.
   *
   * The entry carries the storage key, the filename, the size and the list of
   * places that referenced the asset at the moment it went, because after this
   * action there is nothing left to reconstruct any of that from. It is the
   * only surviving record of the file's existence.
   */
  'media:delete',
  /**
   * Re-cropping an asset already in the library: new bytes, new storage key,
   * SAME asset id — so every reference to it follows automatically.
   *
   * Distinct from `media:upload` because nothing was added to the library, and
   * distinct from `media:delete` because nothing was removed from it. The
   * entry carries both keys, which is what makes an old URL in a log traceable
   * to the asset it became.
   */
  'media:replace',
  /**
   * A STUDENT uploading their own profile photo — kept distinct from
   * `media:upload`, which is staff putting an asset in the library. They are
   * different questions to ask the log months later, they come from different
   * permissions (`profile:write` vs `media:write`), and folding them together
   * would make "who uploaded what" unanswerable for the one path every
   * account on the platform can reach.
   */
  'profile:avatar-upload',
  'taxonomy:create',
  'taxonomy:update',
  'taxonomy:archive',
  'student:update',
  'student:role-change',
  /**
   * حظر ورفع الحظر — three separate actions and not one `student:access`
   * toggle, for the same reason `student:role-change` is separate from
   * `student:update`: the log is read by someone asking a specific question
   * months later, and «مين حظر الطالب ده وإمتى» must be answerable without
   * filtering a generic action by a metadata field.
   *
   * `student:ban` is also the one entry here that is recorded on FAILURE as
   * well as success — a refused delete (the account owns authored content)
   * writes `outcome: 'failure'` with the blocking counts, because an admin
   * repeatedly trying to erase an account is worth seeing whether or not it
   * worked.
   */
  'student:ban',
  'student:unban',
  /**
   * The only irreversible action in this catalogue. Its metadata carries the
   * deleted account's EMAIL and NAME, not just the id — after the row is gone
   * `resourceId` resolves to nothing, and an audit entry whose subject cannot
   * be identified is not an audit entry. See `StudentsService.remove` for why
   * the write happens before the delete rather than after.
   */
  'student:delete',
  /**
   * Overwriting a student's password. Metadata never carries the password
   * itself — only the actor — for the same reason `student:ban`'s reason is
   * free text and this is not: a hash cannot be reconstructed from this
   * entry, and it must not become the one place in `audit_log` that could
   * ever be mistaken for holding a credential in the clear.
   */
  'student:set-password',
  /**
   * Opening and closing a single course for a single student — the key to
   * `Course.requiresGrant`.
   *
   * Recorded separately from `student:update` because it is the entry anyone
   * asking "who gave this student this course, and when" is looking for, and
   * because a revocation is the one student-facing action that TAKES something
   * away. `access_grant` rows are never deleted (revoking stamps `revokedAt`),
   * so the audit log and the grant table agree with each other.
   */
  'student:grant-course',
  'student:revoke-course',
  'attempt:unlock',
  // «نيوز» — the public articles section. publish/unpublish are recorded
  // separately from update because they are the two entries anyone auditing
  // "what went live on the site, and when" is actually looking for.
  'news:create',
  'news:update',
  'news:publish',
  'news:unpublish',
  'news:delete',
  /**
   * التسويق — outbound WhatsApp.
   *
   * Five entries rather than one, and the split is not ceremonial: this is the
   * only subsystem on the platform that speaks to people OUTSIDE it, from a
   * number that belongs to a person rather than to the company. «مين شغّل
   * الحملة دي، وامتى، وعلى كام رقم» is the question that gets asked after a
   * complaint, and `campaign:start` is the entry that answers it — it carries
   * the frozen recipient count and the pacing the run was started with, both
   * of which can be edited on a draft and neither of which the row will still
   * show a week later.
   *
   * `whatsapp:link` records the device pairing itself, because linking a
   * sender number is the moment the platform gains the ability to speak as
   * somebody, and nothing else in the log would show it happening.
   */
  'campaign:create',
  'campaign:update',
  'campaign:start',
  'campaign:pause',
  'campaign:cancel',
  'campaign:delete',
  'whatsapp:link',
  'whatsapp:unlink',
  // Vodafone Cash course subscriptions. `payment:submit` is written by the
  // STUDENT — the one auditable action in this list an admin never takes —
  // because a rejected claim's whole value is a durable record of exactly
  // what was claimed, and that trail has to start before any admin looks
  // at it.
  'payment:submit',
  'payment:approve',
  'payment:reject',
  // The admin student page's own entry point into the same subscription
  // machinery — recording a payment that happened outside this review flow,
  // or comping a term for free (`payment:admin-subscribe`), and closing one
  // of those or a genuinely paid subscription back down
  // (`payment:admin-cancel-subscription`). Split from `payment:approve` even
  // though both reach the same `AccessGrant` state: one is a REVIEW of a
  // student's own claim, the other is the admin acting with no claim behind
  // it at all — a materially different fact for the log to distinguish.
  'payment:admin-subscribe',
  'payment:admin-cancel-subscription',
] as const;

export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditOutcomeSchema = z.enum(['success', 'failure', 'denied']);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

export const AuditEntrySchema = z.object({
  /** BigInt serialised as a decimal string — JSON has no 64-bit integer. */
  id: z.string(),
  occurredAt: z.string(),
  actorUserId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  actorIp: z.string().nullable(),
  action: AuditActionSchema,
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  outcome: AuditOutcomeSchema,
  metadata: z.unknown().nullable(),
  prevHash: z.string().nullable(),
  hash: z.string(),
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;
