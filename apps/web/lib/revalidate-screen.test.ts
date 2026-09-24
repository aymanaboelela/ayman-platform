import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));

const { revalidatePath } = await import('./revalidate-screen');
const next = await import('next/cache');

/**
 * الشاشة اللي الأدمن واقف عليها لازم تترسم تاني بعد الأكشن.
 *
 * `revalidatePath` لوحده كان بيعدّي على dev وبيسيب الصفحة قديمة على
 * البرودكشن — اقرا `revalidate-screen.ts`. التست ده مش بيقدر يثبت سلوك
 * البرودكشن نفسه؛ اللي بيثبته إن حد مايشيلش `refresh()` وهو فاكرها زيادة.
 */
describe('revalidatePath (admin screens)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invalidates the named path AND re-renders the current screen', () => {
    revalidatePath('/admin/students/abc');
    expect(next.revalidatePath).toHaveBeenCalledWith('/admin/students/abc');
    expect(next.refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the write when refresh() refuses outside a Server Action', () => {
    vi.mocked(next.refresh).mockImplementationOnce(() => {
      throw new Error('refresh can only be called from within a Server Action');
    });
    expect(() => revalidatePath('/admin/finance')).not.toThrow();
    expect(next.revalidatePath).toHaveBeenCalledWith('/admin/finance');
  });
});
