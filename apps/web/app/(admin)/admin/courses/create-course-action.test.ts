import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => '', get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ updateTag: vi.fn() }));
vi.mock('@/lib/revalidate-screen', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const { createCourseAction } = await import('./actions');

const VALID: Record<string, string> = {
  slug: 'new-course',
  title: 'كورس تجريبي',
  systemId: '123e4567-e89b-12d3-a456-426614174000',
  subjectId: '123e4567-e89b-12d3-a456-426614174001',
  year: '2',
};

function formDataOf(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) fd.set(key, value);
  return fd;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/**
 * «الصفحة وقعت» on production, digest 2364962632: `POST /api/admin/courses`
 * answered 409 (a reused slug), `createCourseAction` had no catch around it,
 * and the throw went straight past every surface boundary to
 * `(admin)/error.tsx`. This is the fix — the ordinary, fixable mistakes send
 * him back to the create page instead of crashing it.
 */
describe('createCourseAction — a slug already in use', () => {
  it('redirects back to the create page with the slug and which message to show', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"statusCode":409,"message":"slug already in use"}', { status: 409 })),
    );

    await expect(createCourseAction(formDataOf({ slug: 'taken-slug' }))).rejects.toThrow(
      'REDIRECT:/admin/courses/new?formError=slugTaken&slug=taken-slug',
    );
  });

  it('does the same for the offering-missing 400, with its own message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"no offering"}', { status: 400 })));

    await expect(createCourseAction(formDataOf())).rejects.toThrow(
      'REDIRECT:/admin/courses/new?formError=offeringMissing&slug=new-course',
    );
  });

  it('still throws straight through for a genuine fault — a 500 is not a mistake he can fix here', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));

    await expect(createCourseAction(formDataOf())).rejects.toThrow(/failed with 500/);
  });

  /**
   * One step earlier than the two cases above: no network call at all. A
   * subject picker left empty (year 1, or any ثانوية عامة track, before
   * `getTaxonomy()` exposed plain offerings) sends no `subjectId` field — the
   * form never renders one — so `CourseCreateSchema.parse` itself rejects
   * before `apiSend` is ever reached, which the first `try` never covered.
   * Same redirect, same message: from here, "never offered" and "the server
   * doesn't recognise it" are the same fixable mistake.
   */
  it('redirects the same way for a client-side validation failure — an empty subject picker, never reaching the server', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(createCourseAction(formDataOf({ subjectId: '' }))).rejects.toThrow(
      'REDIRECT:/admin/courses/new?formError=offeringMissing&slug=new-course',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never scaffolds a lecture or invalidates the catalog on a rejected create', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 409 }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(createCourseAction(formDataOf())).rejects.toThrow('REDIRECT:');

    // The only request made is the failed create itself — no lesson, no
    // section, nothing left half-built on a course that does not exist.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
