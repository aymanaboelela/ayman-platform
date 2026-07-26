/**
 * The single source of the quiz route path. Plan 5 owns
 * `app/(app)/quizzes/[lessonId]/**` and imports this helper rather than
 * re-declaring the path, so the player's doorway link and the quiz runner's
 * own route can never drift apart.
 */
export const quizHref = (lessonId: string): string => `/quizzes/${lessonId}`;
