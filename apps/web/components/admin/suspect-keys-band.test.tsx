import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import type { SuspectKeyRow } from '@ayman/contracts/quiz/suspect-key';

const adminGet = vi.fn();
vi.mock('@/lib/admin-api', () => ({ adminGet: (...args: unknown[]) => adminGet(...args) }));

const { SuspectKeysBand } = await import('./suspect-keys-band');

const ROW: SuspectKeyRow = {
  questionVersionId: '0196a1e0-0000-7000-8000-000000000003',
  bankEntryId: '0196a1e0-0000-7000-8000-000000000004',
  stemText: 'الذاكرة RAM بتحتفظ بالبيانات بعد قفل الجهاز',
  quizTitle: 'اختبار الوحدة الأولى',
  pickedText: 'خطأ',
  keyText: 'صح',
  picks: 9,
  answers: 9,
  edited: false,
  alertedAt: '2026-10-18T10:00:00.000Z',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('<SuspectKeysBand>', () => {
  it('lists each suspect question with its evidence, the fix, and a way into the editor', async () => {
    adminGet.mockResolvedValue({ rows: [ROW] });
    const html = renderToStaticMarkup((await SuspectKeysBand())!);

    expect(adminGet).toHaveBeenCalledWith('/api/admin/questions/suspect-keys', expect.anything());
    expect(html).toContain(copy.quizAdmin.suspectKeysTitle);
    expect(html).toContain('«صحّح من جديد»');
    expect(html).toContain(ROW.stemText);
    expect(html).toContain('9 من 9 اختاروا «خطأ»');
    expect(html).toContain(`href="/admin/questions/${ROW.bankEntryId}"`);
    expect(html).toContain(copy.quizAdmin.suspectKeyOpen);
    expect(html).not.toContain(copy.quizAdmin.suspectKeysEdited);
  });

  it('says only the regrade is left once the key was already corrected', async () => {
    adminGet.mockResolvedValue({ rows: [{ ...ROW, edited: true }] });
    const html = renderToStaticMarkup((await SuspectKeysBand())!);

    expect(html).toContain(copy.quizAdmin.suspectKeysEdited);
  });

  it('renders nothing on the ordinary day, and nothing when the API fails', async () => {
    adminGet.mockResolvedValue({ rows: [] });
    expect(await SuspectKeysBand()).toBeNull();

    adminGet.mockRejectedValue(new Error('GET failed with 500'));
    expect(await SuspectKeysBand()).toBeNull();
  });
});
