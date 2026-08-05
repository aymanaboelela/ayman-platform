import { SetMetadata } from '@nestjs/common';

export const REQUIRE_CSRF_KEY = 'requireCsrf';

/**
 * Keeps CSRF enforcement on a route that is also `@Public()`.
 *
 * `CsrfGuard` skips public routes, and for every public route that existed
 * when it was written that was right: they were all GETs, plus the browser's
 * own CSP-violation POST, which cannot carry a custom header at all.
 *
 * المساعد broke that assumption — it has public routes that WRITE. Without
 * this, a page on another origin could make a signed-in student's browser
 * open a conversation, or append a message to the thread they already have,
 * and the instructor would read words that student never typed. That the
 * damage is "only" a forged support message is not a reason to leave it: the
 * whole value of the inbox is that what it shows is what someone said.
 *
 * Public still means "no session required". It does not mean "no origin
 * check" — those are different questions and were only ever answered together
 * by accident.
 */
export const RequireCsrf = () => SetMetadata(REQUIRE_CSRF_KEY, true);
