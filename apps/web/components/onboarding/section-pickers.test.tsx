import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import type { Onboarding } from '@ayman/contracts/onboarding';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { SectionPickers } from './section-pickers';

/**
 * The three selects a stack that does not teach code asks, driven the way a
 * student drives them — and the one trap they exist to avoid: a track left in
 * the form after the select that showed it has gone. react-hook-form keeps
 * the value of an unmounted field, and `refineSection` then refuses a year-1
 * section with a track, on a field nobody can see.
 */
const TAXONOMY = {
  governorates: [],
  pinnedGovernorateCodes: [],
  systems: [
    {
      id: 'sys-bac',
      slug: 'bacalorya',
      nameAr: 'البكالوريا المصرية',
      totalMarks: 600,
      passPercent: 70,
      allowsRetakes: true,
      years: [
        { year: 1, labelAr: 'الصف الأول بكالوريا', badgeAr: 'x' },
        { year: 2, labelAr: 'الصف الثاني بكالوريا', badgeAr: 'x' },
        { year: 3, labelAr: 'الصف الثالث بكالوريا', badgeAr: 'x' },
      ],
      tracks: [{ id: 'track-med', slug: 'medicine_life_sciences', labelAr: 'مسار الطب', minYear: 2, electiveGroups: [] }],
      subjects: [],
    },
    {
      id: 'sys-tha',
      slug: 'thanaweya_amma',
      nameAr: 'الثانوية العامة',
      totalMarks: 320,
      passPercent: 50,
      allowsRetakes: false,
      years: [
        { year: 1, labelAr: 'الصف الأول الثانوي', badgeAr: 'x' },
        { year: 2, labelAr: 'الصف الثاني الثانوي', badgeAr: 'x' },
        { year: 3, labelAr: 'الصف الثالث الثانوي', badgeAr: 'x' },
      ],
      tracks: [{ id: 'track-sci', slug: 'science_science', labelAr: 'علمي علوم', minYear: 2, electiveGroups: [] }],
      subjects: [],
    },
  ],
} as unknown as Taxonomy;

afterEach(cleanup);

function renderPickers() {
  let read: () => Partial<Onboarding> = () => ({});
  function Harness() {
    const form = useForm<Onboarding>();
    read = () => form.getValues();
    return (
      <form>
        <SectionPickers
          taxonomy={TAXONOMY}
          control={form.control}
          register={form.register}
          setValue={form.setValue}
          errors={form.formState.errors}
          deferUntilHydrated={false}
        />
      </form>
    );
  }
  const view = render(<Harness />);
  const select = (name: string) => view.container.querySelector(`select[name="${name}"]`) as HTMLSelectElement;
  const choose = async (name: string, value: string) => {
    await act(async () => {
      fireEvent.change(select(name), { target: { value } });
    });
  };
  return { view, select, choose, values: () => read() };
}

describe('SectionPickers', () => {
  it('offers no year until a system is chosen, then that system’s own labels', async () => {
    const { select, choose } = renderPickers();
    expect(select('year').disabled).toBe(true);
    await choose('system', 'thanaweya_amma');
    expect(select('year').disabled).toBe(false);
    expect([...select('year').options].map((option) => option.text)).toContain('الصف الثاني الثانوي');
  });

  it('asks for a track from year 2 on, and only that system’s', async () => {
    const { select, choose } = renderPickers();
    await choose('system', 'bacalorya');
    await choose('year', '1');
    expect(select('trackId')).toBeNull();
    await choose('year', '2');
    expect([...select('trackId').options].map((option) => option.value)).toEqual(['', 'track-med']);
  });

  it('empties the track when the year drops to one that has none', async () => {
    const { choose, values } = renderPickers();
    await choose('system', 'bacalorya');
    await choose('year', '2');
    await choose('trackId', 'track-med');
    expect(values().trackId).toBe('track-med');
    await choose('year', '1');
    expect(values().trackId).toBeUndefined();
  });

  it('keeps a track that is still valid for the new year', async () => {
    const { choose, values } = renderPickers();
    await choose('system', 'bacalorya');
    await choose('year', '2');
    await choose('trackId', 'track-med');
    await choose('year', '3');
    expect(values().trackId).toBe('track-med');
  });

  it('empties the track when the system changes — a track belongs to one system', async () => {
    const { choose, values } = renderPickers();
    await choose('system', 'bacalorya');
    await choose('year', '2');
    await choose('trackId', 'track-med');
    await choose('system', 'thanaweya_amma');
    expect(values().trackId).toBeUndefined();
  });
});
