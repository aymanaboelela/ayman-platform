import { describe, expect, it } from 'vitest';
import type { ExternalBookCourse, ExternalBookRow } from '@ayman/contracts/quiz/external-books';
import { groupBooks } from './groups';

const course = (id: string, year: number, stream: ExternalBookCourse['stream']): ExternalBookCourse => ({
  id,
  title: id,
  year,
  systemName: 'بكالوريا',
  stream,
});
const book = (id: string, courseId: string | null): ExternalBookRow => ({
  id,
  title: id,
  coverKey: null,
  archived: false,
  courseId,
  categoryId: id,
  ready: 0,
  units: 0,
});

describe('groupBooks', () => {
  it('splits books by year then عربي/لغات, unlinked last', () => {
    const courses = [course('y2en', 2, 'languages'), course('y1ar', 1, 'general'), course('y2ar', 2, 'general'), course('y2ar-b', 2, 'general')];
    const groups = groupBooks([book('a', 'y2en'), book('b', null), book('c', 'y2ar'), book('d', 'y1ar'), book('e', 'y2ar-b')], courses);
    expect(groups.map((group) => [group.label, group.rows.map((row) => row.id)])).toEqual([
      ['أولى بكالوريا · عربي', ['d']],
      ['تانية بكالوريا · عربي', ['c', 'e']],
      ['تانية بكالوريا · لغات', ['a']],
      ['كتب مش مربوطة بكورس', ['b']],
    ]);
  });
});
