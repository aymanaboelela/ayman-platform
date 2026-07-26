/**
 * The single source of the quiz route path. Plan 5 owns
 * `app/(app)/quizzes/[lessonId]/**` and imports this helper rather than
 * re-declaring the path, so the player's doorway link and the quiz runner's
 * own route can never drift apart.
 */
export const quizHref = (lessonId: string): string => `/quizzes/${lessonId}`;

/** The in-progress attempt runner. */
export const attemptHref = (lessonId: string, attemptId: string): string =>
  `${quizHref(lessonId)}/attempt/${attemptId}`;

/** The results/review screen for a (submitted or in-progress, per the review matrix) attempt. */
export const reviewHref = (lessonId: string, attemptId: string): string =>
  `${attemptHref(lessonId, attemptId)}/review`;
