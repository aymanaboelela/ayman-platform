import type { AdminHomeworkLessonSummary } from '@ayman/contracts/homework';

export interface HomeworkSectionGroup {
  title: string;
  lessons: AdminHomeworkLessonSummary[];
}

export interface HomeworkCourseGroup {
  courseId: string;
  courseTitle: string;
  pending: number;
  sections: HomeworkSectionGroup[];
}

/**
 * The overview's shape: course → section → lecture.
 *
 * The API already returns the lines in order (newest course first, then the
 * course's own outline), so this only folds consecutive lines together and
 * never re-sorts — a second ordering here would be a second opinion about
 * what «first» means.
 */
export function groupHomeworkLessons(lines: readonly AdminHomeworkLessonSummary[]): HomeworkCourseGroup[] {
  const courses: HomeworkCourseGroup[] = [];
  for (const line of lines) {
    let course = courses.at(-1);
    if (course?.courseId !== line.courseId) {
      course = { courseId: line.courseId, courseTitle: line.courseTitle, pending: 0, sections: [] };
      courses.push(course);
    }
    course.pending += line.pending;
    let section = course.sections.at(-1);
    if (section?.title !== line.sectionTitle) {
      section = { title: line.sectionTitle, lessons: [] };
      course.sections.push(section);
    }
    section.lessons.push(line);
  }
  return courses;
}
