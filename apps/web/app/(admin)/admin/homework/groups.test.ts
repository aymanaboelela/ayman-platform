import { describe, expect, it } from 'vitest';
import type { AdminHomeworkLessonSummary } from '@ayman/contracts/homework';
import { groupHomeworkLessons } from './groups';

let seq = 0;
function line(courseId: string, sectionTitle: string, pending: number): AdminHomeworkLessonSummary {
  seq += 1;
  return {
    lessonId: `0190cccc-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    lessonTitle: `المحاضرة ${seq}`,
    sectionTitle,
    courseId,
    courseTitle: courseId === 'a' ? 'الشهر التاني' : 'الشهر الأول',
    pending,
    accepted: 1,
    needsWork: 0,
    lastSubmittedAt: '2026-10-10T10:00:00.000Z',
  };
}

describe('groupHomeworkLessons', () => {
  it('folds the API’s ordered lines into course → section → lecture, without re-sorting', () => {
    const lines = [line('a', 'المقدمة', 2), line('a', 'المقدمة', 0), line('a', 'الفصل التاني', 3), line('b', 'المقدمة', 1)];
    const groups = groupHomeworkLessons(lines);

    expect(groups.map((g) => g.courseTitle)).toEqual(['الشهر التاني', 'الشهر الأول']);
    expect(groups[0]!.pending).toBe(5);
    expect(groups[0]!.sections.map((s) => [s.title, s.lessons.length])).toEqual([
      ['المقدمة', 2],
      ['الفصل التاني', 1],
    ]);
    expect(groups[0]!.sections[0]!.lessons.map((l) => l.lessonId)).toEqual([lines[0]!.lessonId, lines[1]!.lessonId]);
    expect(groups[1]!.pending).toBe(1);
  });

  it('is empty for nothing handed in', () => {
    expect(groupHomeworkLessons([])).toEqual([]);
  });
});
