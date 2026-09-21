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
  /// «شهر ١» … «شهر ٩» — the slice a monthly subscriber buys. A sibling of
  /// `courseTerm` and not a reuse of it: a term groups sections and a month
  /// groups lectures, and closing one revokes access while closing the other
  /// only takes it off sale. Two resources, because an admin auditing «مين
  /// قفل شهر ٣» must not have to read term rows to find out.
  courseMonth: 'course_months',
  lesson: 'lessons',
  enrollment: 'enrollments',
  questionVersion: 'question_versions',
  quiz: 'quizzes',
  quizAttempt: 'quiz_attempts',
  taxonomy: 'taxonomy',
  paymentSubmission: 'payment_submissions',
  /// «التحويلات الواردة» — money that landed, as read off the receiving
  /// phone. Its own resource type and not `payment_submissions`, because the
  /// audit viewer's filter is how "what did the platform believe arrived" gets
  /// answered, and an ingest that matched NOTHING has no submission to hang off.
  incomingTransfer: 'incoming_transfers',
  bookOrder: 'book_orders',
  /// المصروفات. Its own resource type for the reason `book` below has one: the
  /// audit viewer's filter is how "who wrote this number into the books" gets
  /// answered, and folding spend in with orders would bury it.
  expense: 'expenses',
  /// «قسم الكتب» — the catalogue. Its own resource type and not `book_orders`,
  /// because the audit viewer's filter is how "who changed a price" is answered,
  /// and folding the two together would bury every catalogue edit inside a list
  /// of shipping actions.
  book: 'books',
  /// الواجب — a student's answer to a lecture's exercise. Its own resource type
  /// because the two entries that matter about one are «اتصحّح» and «الصور
  /// اتمسحت», and a deletion of somebody's uploaded work is exactly the kind of
  /// irreversible act the audit filter exists to be able to answer for.
  homeworkSubmission: 'homework_submissions',
} as const;

export type AuditResource = (typeof AUDIT_RESOURCES)[keyof typeof AUDIT_RESOURCES];
