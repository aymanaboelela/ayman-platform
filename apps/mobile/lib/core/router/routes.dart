/// Every route path in the app, as a constant.
///
/// The paths MIRROR the web app's URLs exactly — `/library/:slug`, not
/// `/course-detail`. Three reasons, and only the first is aesthetic:
///
///  1. A notification's deep link is a real aymanaboelela.com URL. If the app's
///     routes match, handling one is a `context.go(uri.path)` rather than a
///     translation table that has to be kept in sync with the web's routing by
///     hand.
///  2. Universal Links / App Links hand the OS-resolved https URL straight to
///     the router.
///  3. When a screen is wrong, the same path names the same screen in both
///     apps, so a bug report about `/quizzes/x/attempt/y` needs no translation.
///
/// ⚠️ Not every web route exists here, and that is deliberate — see
/// [AppRoutes.notInTheApp] at the bottom.
abstract final class AppRoutes {
  // ── unauthenticated ──────────────────────────────────────────────────────
  static const splash = '/';
  static const login = '/login';
  static const register = '/register';

  /// The multi-step wizard a new student must finish before anything else is
  /// reachable. The API rejects most reads until `onboardingCompletedAt` is
  /// set, so this is a gate, not a suggestion.
  static const onboarding = '/onboarding';

  /// Shown once, immediately after onboarding.
  static const welcome = '/welcome';

  // ── the signed-in shell ──────────────────────────────────────────────────
  static const dashboard = '/dashboard';
  static const path = '/path';
  static const results = '/results';
  static const library = '/library';
  static const foundations = '/foundations';
  static const store = '/store';
  static const storeOrders = '/store/orders';
  static const playground = '/playground';
  static const profile = '/profile';
  static const notifications = '/notifications';
  static const devices = '/settings/devices';
  static const section = '/settings/section';

  /// The instructor conversation. No web equivalent as a full page — on the web
  /// it is a docked panel — but a panel is the wrong shape on a phone, where a
  /// chat with voice notes needs the whole screen and its own back stack.
  static const chat = '/chat';

  // ── parameterised ────────────────────────────────────────────────────────
  static const courseDetail = '/library/:slug';
  static String courseDetailOf(String slug) => '/library/$slug';

  static const lesson = '/courses/:slug/lessons/:lessonId';
  static String lessonOf(String slug, String lessonId) =>
      '/courses/$slug/lessons/$lessonId';

  static const quiz = '/quizzes/:lessonId';
  static String quizOf(String lessonId) => '/quizzes/$lessonId';

  /// ⚠️ The one route that renders with NO app chrome at all — no app bar, no
  /// drawer, no assistant, no notification bell. The web does the same
  /// (`isAttemptRoute` discards the entire shell) and for the same reason: a
  /// student mid-exam must not be one tap from navigating away, and the
  /// countdown needs the vertical space.
  static const attempt = '/quizzes/:lessonId/attempt/:attemptId';
  static String attemptOf(String lessonId, String attemptId) =>
      '/quizzes/$lessonId/attempt/$attemptId';

  static const attemptReview = '/quizzes/:lessonId/attempt/:attemptId/review';
  static String attemptReviewOf(String lessonId, String attemptId) =>
      '/quizzes/$lessonId/attempt/$attemptId/review';

  static const bookDetail = '/store/:slug';
  static String bookDetailOf(String slug) => '/store/$slug';

  static const newsArticle = '/news/:slug';
  static String newsArticleOf(String slug) => '/news/$slug';

  // ── admin ────────────────────────────────────────────────────────────────
  /// Gated on the `admin:access` permission. The tab is not merely hidden
  /// without it — the route refuses to build, because hiding a control is a
  /// presentation decision and this is an authorisation one.
  static const admin = '/admin';
  static const adminPayments = '/admin/payments';
  static const adminTransfers = '/admin/transfers';
  static const adminStudents = '/admin/students';
  static const adminStudentDetail = '/admin/students/:userId';
  static String adminStudentDetailOf(String userId) => '/admin/students/$userId';
  static const adminInbox = '/admin/inbox';
  static const adminInboxThread = '/admin/inbox/:id';
  static String adminInboxThreadOf(String id) => '/admin/inbox/$id';
  static const adminHomework = '/admin/homework';
  static const adminHomeworkDetail = '/admin/homework/:id';
  static String adminHomeworkDetailOf(String id) => '/admin/homework/$id';
  static const adminCourses = '/admin/courses';
  static const adminCourseDetail = '/admin/courses/:id';
  static String adminCourseDetailOf(String id) => '/admin/courses/$id';
  static const adminBookOrders = '/admin/books';
  static const adminFinance = '/admin/finance';
  static const adminAnalytics = '/admin/analytics';
  static const adminAttempts = '/admin/attempts';
  static const adminErrors = '/admin/errors';
  static const adminAudit = '/admin/audit';
  static const adminNews = '/admin/news';
  static const adminSettings = '/admin/settings';

  /// Whether a path is the exam runner, which renders bare.
  ///
  /// Anchored — `…/review` must NOT match. The web's `isAttemptRoute` is the
  /// same regex for the same reason: the review screen is a normal page and
  /// stripping its chrome would trap the student on it.
  static bool isAttemptRoute(String location) =>
      RegExp(r'^/quizzes/[^/]+/attempt/[^/]+$').hasMatch(location);

  /// Whether a path is the lesson player, which hides the bottom bar so the
  /// video can use the full height.
  static bool isLessonRoute(String location) =>
      RegExp(r'^/courses/[^/]+/lessons/[^/]+').hasMatch(location);

  /// Whether a path renders OUTSIDE the tab shell, on the root navigator.
  ///
  /// ⚠️ This is what decides `push` against `go`, and getting it wrong is not
  /// a cosmetic bug.
  ///
  /// `go` REPLACES the navigation stack. Applied to a root-level route it
  /// destroys the shell, so the system back gesture has nothing to return to
  /// and closes the app. Measured exactly that way on the emulator: tapping a
  /// course card opened the lesson, and one back press left the platform
  /// altogether.
  ///
  /// Inside the shell `go` is correct — it rebuilds the branch's stack, so
  /// «الكورسات» → a course still backs out to the list.
  ///
  /// Use [AppNavigation.open] rather than reading this by hand.
  static bool isOutsideShell(String location) =>
      location == chat ||
      location == notifications ||
      isLessonRoute(location) ||
      location.startsWith('/quizzes/');

  /// Web routes the app deliberately does NOT reimplement, and where they go
  /// instead. Written down so the omission reads as a decision rather than as
  /// an unfinished screen.
  ///
  /// - `/` (marketing home), `/about`, `/courses`, `/books`, `/essentials`,
  ///   `/years/:year` — the acquisition funnel. A student who has installed the
  ///   app has already been acquired; these open in the browser from the
  ///   drawer's «الموقع الرئيسي» link.
  /// - `/privacy`, `/terms` — legal pages that change without an app release,
  ///   so they open in an in-app browser and are always current.
  /// - `/news`, `/news/:slug` — read in-app ([newsArticle]) when opened from a
  ///   notification or a share link, but not browsable; the index stays on the
  ///   web.
  /// - `/links` — a link-in-bio page for social profiles. Meaningless inside
  ///   the app.
  /// - `/offline` — the web's service-worker fallback. The app shows its own
  ///   cached content instead.
  /// - `/dev/*` — design fixtures.
  static const notInTheApp = <String>[
    '/',
    '/about',
    '/courses',
    '/books',
    '/essentials',
    '/years/:year',
    '/privacy',
    '/terms',
    '/news',
    '/links',
    '/offline',
    '/dev/*',
  ];
}
