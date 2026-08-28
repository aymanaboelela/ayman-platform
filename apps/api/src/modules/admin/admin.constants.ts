/**
 * Shared constants for the admin surface (Plan 6).
 *
 * These are the values that would otherwise be re-typed as string literals in
 * a service, a controller and a test — three copies that drift. Keeping them
 * here means a rename is one edit and a `grep` finds every consumer.
 */

/**
 * `site_settings` is a singleton. `id = 1` is enforced by the
 * `site_settings_singleton` CHECK constraint in the `platform_config`
 * migration (A5), and the row is seeded by that same migration, so every read
 * is a plain `findUnique` and never a "create it if it's missing" race
 * between two concurrent admins.
 */
export const SITE_SETTINGS_ID = 1;

/**
 * `audit_log.resource_type` values. Free text in the column (so a future
 * resource does not need a migration), closed here (so the audit viewer's
 * filter and every writer agree on spelling).
 */
export const AUDIT_RESOURCES = {
  siteSettings: 'site_settings',
  featureFlag: 'feature_flags',
  navigationItem: 'navigation_items',
  homeBlock: 'home_blocks',
  /// «نيوز» — the public articles section.
  newsPost: 'news_posts',
  mediaAsset: 'media_assets',
  /// Lesson materials. Also the resourceType for a DOCUMENT UPLOAD, which
  /// happens before any row exists — the storage key in that entry's metadata
  /// is the durable identifier tying the upload to the row created moments
  /// later. Documents are deliberately not `media_assets` rows: that table is
  /// the image library, and every one of its rows has been through the sharp
  /// re-encode a document cannot go through.
  lessonResource: 'lesson_resources',
  user: 'users',
  course: 'courses',
  courseSection: 'course_sections',
  /// الترم الأول / الترم الثاني.
  courseTerm: 'course_terms',
  lesson: 'lessons',
  enrollment: 'enrollments',
  questionVersion: 'question_versions',
  quiz: 'quizzes',
  quizAttempt: 'quiz_attempts',
  taxonomy: 'taxonomy',
  paymentSubmission: 'payment_submissions',
  bookOrder: 'book_orders',
} as const;

export type AuditResource = (typeof AUDIT_RESOURCES)[keyof typeof AUDIT_RESOURCES];
