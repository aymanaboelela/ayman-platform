import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Taxonomy } from '@ayman/contracts/taxonomy';

const apiFetch = vi.fn();
const apiGet = vi.fn();
const apiPatch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiPatch: (...args: unknown[]) => apiPatch(...args),
}));

const { loadRails, loadViewer, saveYear, wizardHoldsYear } = await import('./guide-data');

const json = (status: number, body: unknown = null) => ({
  status,
  ok: status >= 200 && status < 300,
  json: () => Promise.resolve(body),
});

/** The original stack's shape: one system, tracks from the second year. */
const TAXONOMY = {
  governorates: [],
  pinnedGovernorateCodes: [],
  systems: [
    {
      id: 'sys-bac',
      slug: 'bacalorya',
      nameAr: 'البكالوريا المصرية',
      totalMarks: 100,
      passPercent: 50,
      allowsRetakes: true,
      years: [
        { year: 1, labelAr: 'الصف الأول', badgeAr: 'x' },
        { year: 2, labelAr: 'الصف الثاني', badgeAr: 'x' },
        { year: 3, labelAr: 'الصف الثالث', badgeAr: 'x' },
      ],
      tracks: [
        {
          id: 'track-cs',
          slug: 'engineering_cs',
          labelAr: 'مسار الهندسة وعلوم الحاسب',
          minYear: 2,
          electiveGroups: [
            {
              id: 'group-2',
              year: 2,
              labelAr: 'اختياري',
              pickCount: 1,
              options: [{ id: 'elective-cs', subjectId: 's', subjectSlug: 'programming_cs', nameAr: 'البرمجة' }],
            },
          ],
        },
      ],
      subjects: [],
    },
  ],
} as unknown as Taxonomy;

const year = (n: number) => ({ key: `bacalorya:${n}`, systemSlug: 'bacalorya', year: n, label: `الصف ${n}` });

beforeEach(() => {
  apiFetch.mockReset();
  apiGet.mockReset();
  apiPatch.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('who is looking, when the dialog opens', () => {
  it('is a visitor on 401, without asking for a profile', async () => {
    apiFetch.mockResolvedValue(json(401));
    expect(await loadViewer()).toEqual({ signedIn: false, saved: { year: null, systemId: null, stream: null } });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('is a visitor when the session cannot be read at all', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));
    expect((await loadViewer()).signedIn).toBe(false);
  });

  it('brings a signed-in student’s saved year and stream', async () => {
    apiFetch.mockResolvedValue(json(200, { role: 'student' }));
    apiGet.mockResolvedValue({
      userId: 'u',
      onboardingCompleted: true,
      profile: { year: 2, systemId: 'sys-bac', schoolStream: 'languages' },
    });
    expect(await loadViewer()).toEqual({
      signedIn: true,
      saved: { year: 2, systemId: 'sys-bac', stream: 'languages' },
    });
  });

  it('asks the questions when the profile cannot be read, rather than guess', async () => {
    apiFetch.mockResolvedValue(json(200, { role: 'student' }));
    apiGet.mockRejectedValue(new Error('500'));
    expect(await loadViewer()).toEqual({ signedIn: true, saved: { year: null, systemId: null, stream: null } });
  });
});

describe('the transfer rails', () => {
  it('reads which numbers the stack has set, and nothing else', async () => {
    apiFetch.mockResolvedValue(json(200, { contact: { instapay: '+201000000000', vodafoneCash: null } }));
    expect(await loadRails()).toEqual({ instapay: true, vodafoneCash: false });
    apiFetch.mockResolvedValue(json(200, { contact: { instapay: '  ', vodafoneCash: '+201100000000' } }));
    expect(await loadRails()).toEqual({ instapay: false, vodafoneCash: true });
    apiFetch.mockResolvedValue(json(200, {}));
    expect(await loadRails()).toEqual({ instapay: false, vodafoneCash: false });
  });

  it('fails loudly, so the line is simply not drawn', async () => {
    apiFetch.mockResolvedValue(json(503));
    await expect(loadRails()).rejects.toThrow();
  });
});

describe('writing the year to the profile', () => {
  it('goes through the student’s own section route, with the section the settings screen would send', async () => {
    apiPatch.mockResolvedValue({});
    expect(await saveYear(year(2), TAXONOMY)).toBe(true);
    expect(apiPatch).toHaveBeenCalledTimes(1);
    expect(apiPatch).toHaveBeenCalledWith('/api/profile/section', {
      system: 'bacalorya',
      year: 2,
      trackId: 'track-cs',
      electiveSubjectId: 'elective-cs',
    });
  });

  it('writes a first-year section with no track', async () => {
    apiPatch.mockResolvedValue({});
    await saveYear(year(1), TAXONOMY);
    expect(apiPatch).toHaveBeenCalledWith('/api/profile/section', { system: 'bacalorya', year: 1 });
  });

  it('does not write a year the profile screens cannot show', async () => {
    // The wizard and «بياناتك» offer the first two years on this stack; a
    // third written behind them would be a value nobody can see or correct.
    expect(await saveYear(year(3), TAXONOMY)).toBe(false);
    expect(apiPatch).not.toHaveBeenCalled();
    expect(wizardHoldsYear(3)).toBe(false);
    expect(wizardHoldsYear(2)).toBe(true);
  });

  it('does nothing without the taxonomy, and never throws', async () => {
    expect(await saveYear(year(2), null)).toBe(false);
    apiPatch.mockRejectedValue(new Error('404 — no profile yet'));
    expect(await saveYear(year(2), TAXONOMY)).toBe(false);
  });

  it('never sends anything but the four section fields', async () => {
    apiPatch.mockResolvedValue({});
    await saveYear(year(2), TAXONOMY);
    const body = apiPatch.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['electiveSubjectId', 'system', 'trackId', 'year']);
  });
});
