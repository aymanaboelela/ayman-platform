import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { ApiSendError } from '@/lib/api-server';

/**
 * The runner's page when `resume` refuses.
 *
 * The 17:00 wave on `/admin/errors` was this route: students reopening their
 * paper the minute the exam window shut, `resume` answering 403
 * `quiz_closed`, and the page throwing it — an error screen with a digest over
 * answers that were already saved. Each refusal now has its sentence.
 */
const apiSend = vi.fn();

vi.mock('@/lib/api-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-server')>('@/lib/api-server');
  return { ...actual, apiSend: (...args: unknown[]) => apiSend(...args) };
});
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
  },
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT;${to}`), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
// The runner and the sanitizer are never reached on these paths; keeping their
// module graphs (and `server-only`) out of the test keeps it about the page.
vi.mock('@/components/quiz/quiz-runner', () => ({ QuizRunner: () => null }));
vi.mock('@/lib/sanitize-html', () => ({ sanitizeRichText: (html: string) => html }));

const { default: QuizAttemptPage } = await import('./page');

const open = () =>
  QuizAttemptPage({ params: Promise.resolve({ lessonId: 'lesson-1', attemptId: 'attempt-1' }) });

const refused = (body: Record<string, unknown>) =>
  new ApiSendError(
    `POST /api/quiz/attempts/attempt-1/resume failed with 403: ${JSON.stringify(body)}`,
    403,
    { statusCode: 403, ...body },
  );

afterEach(() => {
  cleanup();
  apiSend.mockReset();
});

describe('the exam runner, when resume refuses', () => {
  it('says the exam closed and the saved answers are safe — not an error screen', async () => {
    apiSend.mockRejectedValue(refused({ code: 'quiz_closed', details: { openUntil: '2026-10-14T17:00:00.000Z' } }));
    render(await open());

    expect(screen.getByRole('heading', { name: copy.quiz.closed })).toBeInTheDocument();
    expect(screen.getByText(copy.quiz.closedSavedBody)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.quiz.toQuizPage })).toHaveAttribute(
      'href',
      '/quizzes/lesson-1',
    );
  });

  it('says it has not opened yet when the window moved later', async () => {
    apiSend.mockRejectedValue(refused({ code: 'quiz_not_open_yet' }));
    render(await open());
    expect(screen.getByRole('heading', { name: copy.quiz.notOpenYet })).toBeInTheDocument();
  });

  it('names a lapsed subscription, and points at the courses rather than the exam', async () => {
    apiSend.mockRejectedValue(refused({ message: 'expired' }));
    render(await open());
    expect(screen.getByText(copy.quiz.lockedLapsed)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.library.title })).toHaveAttribute('href', '/library');
  });

  it('keeps the not-found page for an attempt that is not this student’s', async () => {
    apiSend.mockRejectedValue(
      new ApiSendError('POST /api/quiz/attempts/attempt-1/resume failed with 404: {}', 404, {}),
    );
    await expect(open()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK');
  });

  it('still lets a real fault reach the boundary', async () => {
    const fault = new ApiSendError('POST /api/quiz/attempts/attempt-1/resume failed with 500: {}', 500, {});
    apiSend.mockRejectedValue(fault);
    await expect(open()).rejects.toBe(fault);
  });
});
