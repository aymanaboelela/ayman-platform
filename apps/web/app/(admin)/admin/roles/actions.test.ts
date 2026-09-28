import { afterEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@ayman/contracts/copy/admin';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: '__Host-csrf=token' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));

const { searchAccountsAction, setStaffRoleAction } = await import('./actions');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const c = copy.admin.roles.staff;

/**
 * صف زي اللي `GET /api/admin/students` بيرجّعه بالظبط قبل ما `role` يتضاف
 * للصف — من غير `role`. البحث كان بيطلبه في سكيمته، فكان بيقع على أول صف.
 */
const ROW_WITHOUT_ROLE = {
  id: 'FxLhZ6LCLUzoY3p9X3PLzsh7FHKA9Hy6',
  fullName: 'أمجد سامي عبد الله',
  email: null,
  phone: '+201010017537',
};

describe('searchAccountsAction', () => {
  it('returns the rows the list route sends, whether or not they carry a role', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ rowCount: 1, rows: [ROW_WITHOUT_ROLE] })),
    );

    await expect(searchAccountsAction('امجد')).resolves.toEqual({
      ok: true,
      rows: [{ id: ROW_WITHOUT_ROLE.id, name: 'أمجد سامي عبد الله', phone: '+201010017537' }],
    });
  });

  it('asks the server for students only — the team is not a search result', async () => {
    const fetchSpy = vi.fn(async (_url: string | URL) => Response.json({ rowCount: 0, rows: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    await searchAccountsAction('امجد');

    const url = new URL(String(fetchSpy.mock.calls[0]![0]), 'http://x');
    expect(url.pathname).toBe('/api/admin/students');
    expect(url.searchParams.get('role')).toBe('student');
    expect(url.searchParams.get('q')).toBe('امجد');
  });

  it('reports a failed search as a failed search', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    await expect(searchAccountsAction('امجد')).resolves.toEqual({ ok: false, message: c.searchFailed });
  });
});

describe('setStaffRoleAction', () => {
  it('refuses a short reason before the request leaves, and says why', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await setStaffRoleAction('u1', 'student', 'مساعد');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('8');
  });
});
