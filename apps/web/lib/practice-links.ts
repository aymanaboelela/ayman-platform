/**
 * The book-practice routes, built in one place — they were template literals
 * repeated across four components, each one a chance to encode a segment the
 * others do not.
 */
export const bookHref = (courseSlug: string, bookId: string): string =>
  `/library/${encodeURIComponent(courseSlug)}/books/${encodeURIComponent(bookId)}`;

export const practiceHref = (courseSlug: string, bookId: string, sessionId: string): string =>
  `${bookHref(courseSlug, bookId)}/practice/${encodeURIComponent(sessionId)}`;
