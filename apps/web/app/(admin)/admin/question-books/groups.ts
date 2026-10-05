import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { ExternalBookCourse, ExternalBookRow } from '@ayman/contracts/quiz/external-books';

const c = copy.admin.questionBooks;

const STREAM_ORDER = { general: 0, languages: 1, both: 2 } as const;

/** «تانية بكالوريا · عربي» — الصف من `yearNames`، ولو برّاها الرقم نفسه. */
export function courseGroupLabel(course: Pick<ExternalBookCourse, 'year' | 'systemName' | 'stream'>): string {
  const year = formatCopy(c.yearGroup, { year: c.yearNames[course.year - 1] ?? String(course.year), system: course.systemName });
  return `${year} · ${c.streams[course.stream]}`;
}

export interface BookGroup {
  key: string;
  label: string;
  rows: ExternalBookRow[];
}

/**
 * الكتب متقسّمة على الصف والشعبة بتوع الكورس المربوط — كورسين بنفس الصف
 * والشعبة (منهج وتأسيسي مثلًا) في مجموعة واحدة. الكتب اللي مش مربوطة في الآخر.
 */
export function groupBooks(rows: readonly ExternalBookRow[], courses: readonly ExternalBookCourse[]): BookGroup[] {
  const byId = new Map(courses.map((course) => [course.id, course]));
  const groups = new Map<string, BookGroup & { order: number }>();
  const loose: ExternalBookRow[] = [];
  for (const row of rows) {
    const course = row.courseId ? byId.get(row.courseId) : undefined;
    if (!course) {
      loose.push(row);
      continue;
    }
    const key = `${course.year}:${course.stream}:${course.systemName}`;
    const group = groups.get(key) ?? {
      key,
      label: courseGroupLabel(course),
      rows: [],
      order: course.year * 10 + STREAM_ORDER[course.stream],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  const sorted = [...groups.values()].sort((a, b) => a.order - b.order).map(({ order: _order, ...group }) => group);
  return loose.length > 0 ? [...sorted, { key: 'none', label: c.noCourseGroup, rows: loose }] : sorted;
}
