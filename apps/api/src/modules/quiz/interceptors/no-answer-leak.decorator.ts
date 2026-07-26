import { SetMetadata } from '@nestjs/common';

export const NO_ANSWER_LEAK_KEY = 'ayman:noAnswerLeak';

/**
 * Marks a route as pre-submission: its response body must not contain a single
 * key from FORBIDDEN_ANSWER_KEYS at any depth. Applied to every learner route
 * that renders a question the student has not yet submitted.
 */
export const NoAnswerLeak = () => SetMetadata(NO_ANSWER_LEAK_KEY, true);
