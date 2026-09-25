import { lessonFilterWithCodes } from './content-access-query';
import type { ContentAccess } from './content-access';

const slice = (lessons: string[] = [], sections: string[] = []): ContentAccess['slice'] => ({
  lessons: new Map(lessons.map((id) => [id, 'g'])),
  sections: new Map(sections.map((id) => [id, 'g'])),
});
const MONTH = { months: { some: { monthId: { in: ['m1'] } } } };

describe('lessonFilterWithCodes — what a lecture COUNT includes', () => {
  it('leaves a student with no codes exactly as the month slice had it', () => {
    expect(lessonFilterWithCodes(MONTH, { slice: slice(), codeOnly: false })).toEqual(MONTH);
    expect(lessonFilterWithCodes(undefined, { slice: slice(), codeOnly: false })).toBeUndefined();
  });

  it('adds code-opened lectures to a month subscriber\'s count', () => {
    expect(lessonFilterWithCodes(MONTH, { slice: slice(['L7']), codeOnly: false })).toEqual({
      OR: [MONTH, { id: { in: ['L7'] } }],
    });
  });

  it('counts ONLY the code-opened lectures for a code-only student — never zero, never the course', () => {
    expect(lessonFilterWithCodes(MONTH, { slice: slice(['L2'], ['S3']), codeOnly: true })).toEqual({
      OR: [{ id: { in: ['L2'] } }, { sectionId: { in: ['S3'] } }],
    });
    expect(lessonFilterWithCodes(undefined, { slice: slice(), codeOnly: true })).toEqual({
      OR: [{ id: { in: [] } }],
    });
  });

  it('does not narrow a course-wide subscriber who also holds a code', () => {
    expect(lessonFilterWithCodes(undefined, { slice: slice(['L2']), codeOnly: false })).toBeUndefined();
  });
});
