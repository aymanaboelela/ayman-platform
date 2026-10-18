import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { ApiRequestError } from '@/lib/api';
import { UPSTREAM_BUSY_DIGEST } from '@/lib/upstream-digest';

/**
 * What the exam page says when the API refuses the student.
 *
 * It used to be the not-found page for a 403 — «the exam is gone», about an
 * exam the student could see on their own dashboard — and an error screen for
 * anything else. A refusal is an answer: it gets the page's own band, the
 * reason, and the way back.
 */
const apiGetAuthed = vi.fn();

vi.mock('@/lib/api-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-server')>('@/lib/api-server');
  return { ...actual, apiGetAuthed: (...args: unknown[]) => apiGetAuthed(...args) };
});
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
  },
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT;${to}`), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { default: QuizIntroPage } = await import('./page');

const open = (lessonId = 'lesson-1') => QuizIntroPage({ params: Promise.resolve({ lessonId }) });

afterEach(() => {
  cleanup();
  apiGetAuthed.mockReset();
});

describe('the exam page, when the API refuses', () => {
  it('says a lapsed subscription is why, and points back to the courses', async () => {
    apiGetAuthed.mockRejectedValue(
      new ApiRequestError(403, '/api/quiz/lessons/lesson-1', { statusCode: 403, message: 'expired' }),
    );
    render(await open());

    expect(screen.getByRole('heading', { name: copy.quiz.blockedTitle })).toBeInTheDocument();
    expect(screen.getByText(copy.quiz.lockedLapsed)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.library.title })).toHaveAttribute('href', '/library');
  });

  it('says the exam is outside the subscription for a month or term refusal', async () => {
    apiGetAuthed.mockRejectedValue(
      new ApiRequestError(403, '/api/quiz/lessons/lesson-1', { statusCode: 403, message: 'needs_month_grant' }),
    );
    render(await open());
    expect(screen.getByText(copy.quiz.lockedNotIncluded)).toBeInTheDocument();
  });

  it('keeps the not-found page for the API’s deliberate 404', async () => {
    apiGetAuthed.mockRejectedValue(new ApiRequestError(404, '/api/quiz/lessons/lesson-1'));
    await expect(open()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK');
  });

  it('sends a signed-out visitor to sign in, back to this exam', async () => {
    apiGetAuthed.mockRejectedValue(new ApiRequestError(401, '/api/quiz/lessons/lesson-1'));
    await expect(open()).rejects.toThrow('NEXT_REDIRECT;/login?next=%2Fquizzes%2Flesson-1');
  });

  it('lets a throttle through to the boundary, carrying the bit that makes it wait and retry', async () => {
    apiGetAuthed.mockRejectedValue(new ApiRequestError(429, '/api/quiz/lessons/lesson-1'));
    const error = (await open().catch((caught: unknown) => caught)) as ApiRequestError;
    expect(error.digest).toBe(UPSTREAM_BUSY_DIGEST);
  });
});
