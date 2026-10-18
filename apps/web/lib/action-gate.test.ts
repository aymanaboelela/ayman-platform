// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The four Server Actions that only refresh a cache, and so never reach Nest.
 *
 * Asserted on the CACHE, not on the gate: a stranger's POST must leave every
 * tag and path exactly as it was. Before the lock, `refreshAfterRecropAction`
 * expired `settings:branding` — read by the root layout, so every page's shell
 * on the platform — for anyone who sent its action id, with no session at all.
 */

const nextCache = vi.hoisted(() => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/cache', () => nextCache);
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'session_token=x', get: () => undefined }),
  headers: async () => new Headers({ cookie: 'session_token=x' }),
}));

const { refreshAfterRecropAction, refreshMediaAction } = await import('@/app/(admin)/admin/media/actions');
const { refreshCourseAction } = await import('@/app/(admin)/admin/courses/actions');
const { refreshAvatarAction } = await import('@/app/(app)/profile/actions');
const { TAG_COURSES, courseTag, tags } = await import('./cache-tags');

function sessionAnswers(answer: () => Promise<Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/api/session');
      return answer();
    }),
  );
}

const session = (permissions: string[]) => async () =>
  new Response(
    JSON.stringify({
      id: 'u1',
      email: null,
      phoneNumber: null,
      name: 'طالب',
      image: null,
      role: permissions.length > 0 ? 'owner' : 'student',
      permissions,
    }),
    { status: 200 },
  );

async function runAll(): Promise<void> {
  await refreshAfterRecropAction();
  await refreshMediaAction();
  await refreshCourseAction('c1');
}

function cacheUntouched(): void {
  expect(nextCache.updateTag).not.toHaveBeenCalled();
  expect(nextCache.revalidatePath).not.toHaveBeenCalled();
  expect(nextCache.revalidateTag).not.toHaveBeenCalled();
  expect(nextCache.refresh).not.toHaveBeenCalled();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('a caller who could not have made the change refreshes nothing', () => {
  it('signed out', async () => {
    sessionAnswers(async () => new Response('{"message":"Unauthorized"}', { status: 401 }));
    await runAll();
    await refreshAvatarAction();
    cacheUntouched();
  });

  it('a student', async () => {
    sessionAnswers(session([]));
    await runAll();
    cacheUntouched();
  });

  it('staff holding neither write permission', async () => {
    sessionAnswers(session(['admin:access', 'media:read', 'course:read-admin']));
    await runAll();
    cacheUntouched();
  });

  it('nobody, while the API is down — and the action still resolves', async () => {
    sessionAnswers(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(runAll()).resolves.toBeUndefined();
    await expect(refreshAvatarAction()).resolves.toBeUndefined();
    cacheUntouched();
  });
});

describe('the staff member who made the change still gets the fresh screen', () => {
  it('media:write — the re-crop drops the branding and SEO entries', async () => {
    sessionAnswers(session(['media:write']));
    await refreshAfterRecropAction();
    expect(nextCache.updateTag).toHaveBeenCalledWith(tags.settings('branding'));
    expect(nextCache.updateTag).toHaveBeenCalledWith(tags.settings('seo'));
    await refreshMediaAction();
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/admin/media');
  });

  it('lesson:write — the finished encode drops the course and the catalog', async () => {
    sessionAnswers(session(['lesson:write']));
    await refreshCourseAction('c1');
    expect(nextCache.updateTag).toHaveBeenCalledWith(courseTag('c1'));
    expect(nextCache.updateTag).toHaveBeenCalledWith(TAG_COURSES);
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/admin/courses/c1');
  });

  it('a signed-in student refreshes their own profile after a new photo', async () => {
    sessionAnswers(session([]));
    await refreshAvatarAction();
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/profile');
    expect(nextCache.refresh).toHaveBeenCalled();
  });
});
