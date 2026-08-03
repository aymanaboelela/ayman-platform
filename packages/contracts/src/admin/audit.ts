import { z } from 'zod';

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
  'attempt:unlock',
  'appeal:resolve',
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
