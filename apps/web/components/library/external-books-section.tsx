import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { formatCopy } from '@ayman/contracts/format';
import type { StudentExternalBookSummary } from '@ayman/contracts/quiz/external-books';
import { bookHref } from '@/lib/practice-links';

const x = quizExperience.books;
const n = quizExperience.counts;

interface ExternalBooksSectionProps {
  books: StudentExternalBookSummary[];
  courseSlug: string;
}

/**
 * «أسئلة الكتب الخارجية» on an enrolled course's page — the books whose banks
 * the student can practise on.
 *
 * The page's own objects: a `.group-head` like every section beside it, and a
 * `.lesson-row` per book — well, title, counts, and the chip at the inline end,
 * whose link stretches over the whole row (`.lesson-row__link`) so the title a
 * student aims at is the target too, with one tab stop. It was a bordered
 * panel of its own, in Modern Standard Arabic, with «4 وحدات / 16 درس» counts
 * that do not agree with their numbers and a button labelled
 * «تصفح الأسئلة وابدأ الاختبار».
 */
export function ExternalBooksSection({ books, courseSlug }: ExternalBooksSectionProps) {
  if (books.length === 0) return null;

  return (
    <section className="mb-8" aria-labelledby="external-books-title">
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 id="external-books-title" className="group-head__title">
          {x.sectionTitle}
        </h2>
        <span className="group-head__count">{arabicCount(books.length, n.books)}</span>
      </div>
      <p className="mb-4 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{x.sectionLead}</p>

      <div className="unit">
        <ul className="unit__body">
          {books.map((book) => (
            <li key={book.id} className="lesson-row">
              <span className="lesson-row__well" aria-hidden="true">
                <BookOpen className="size-4" />
              </span>
              <span className="lesson-row__text">
                <span className="lesson-row__title">{book.title}</span>
                <span className="lesson-row__meta">
                  {formatCopy(x.bookMeta, {
                    questions: arabicCount(book.ready, x.questionsReady),
                    units: arabicCount(book.unitsCount, n.units),
                    lessons: arabicCount(book.lessonsCount, n.lessons),
                  })}
                </span>
              </span>
              <Link
                href={bookHref(courseSlug, book.id)}
                className="chip chip--solid lesson-row__link"
                aria-label={formatCopy(x.openBookLabel, { title: book.title })}
              >
                {x.openBook}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
