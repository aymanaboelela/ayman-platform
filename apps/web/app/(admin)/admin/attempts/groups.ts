import type { AdminAttemptQuizSummary } from '@ayman/contracts/admin/attempts';

export interface AttemptSectionGroup {
  sectionId: string;
  title: string;
  quizzes: AdminAttemptQuizSummary[];
}

export interface AttemptCourseGroup {
  courseId: string;
  courseTitle: string;
  archived: boolean;
  attempts: number;
  pendingReview: number;
  inProgress: number;
  sections: AttemptSectionGroup[];
}

/**
 * The overview's shape: course → unit → quiz.
 *
 * The API already returns the lines in the course's own order (course, unit,
 * lesson position), so this only folds consecutive lines together and never
 * re-sorts — a second ordering here would be a second opinion about what comes
 * first. Units fold on their ID, not their title: two units can share a name
 * («مراجعة»), and folding by title would merge them into one heading.
 */
export function groupAttemptQuizzes(lines: readonly AdminAttemptQuizSummary[]): AttemptCourseGroup[] {
  const courses: AttemptCourseGroup[] = [];
  for (const line of lines) {
    let course = courses.at(-1);
    if (course?.courseId !== line.courseId) {
      course = {
        courseId: line.courseId,
        courseTitle: line.courseTitle,
        archived: line.courseArchived,
        attempts: 0,
        pendingReview: 0,
        inProgress: 0,
        sections: [],
      };
      courses.push(course);
    }
    course.attempts += line.attempts;
    course.pendingReview += line.pendingReview;
    course.inProgress += line.inProgress;

    let section = course.sections.at(-1);
    if (section?.sectionId !== line.sectionId) {
      section = { sectionId: line.sectionId, title: line.sectionTitle, quizzes: [] };
      course.sections.push(section);
    }
    section.quizzes.push(line);
  }
  return courses;
}
