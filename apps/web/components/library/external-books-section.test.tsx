import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExternalBooksSection } from './external-books-section';

afterEach(cleanup);

describe('ExternalBooksSection', () => {
  it('renders nothing when books list is empty', () => {
    const { container } = render(
      <ExternalBooksSection books={[]} courseSlug="physics" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders external books with question count and navigation links', () => {
    const mockBooks = [
      {
        id: 'book-123',
        title: 'بنك أسئلة المنهج - أولى عربي',
        coverKey: null,
        courseId: 'course-123',
        ready: 1218,
        unitsCount: 4,
        lessonsCount: 16,
      },
    ];

    render(
      <ExternalBooksSection books={mockBooks} courseSlug="physics-1" />,
    );

    expect(screen.getByText('أسئلة الكتب الخارجية')).toBeInTheDocument();
    expect(screen.getByText('بنك أسئلة المنهج - أولى عربي')).toBeInTheDocument();
    // Every count agrees with its number — «4 وحدات», «16 درس», «1218 سؤال».
    expect(screen.getByText('1218 سؤال جاهز · 4 وحدات · 16 درس')).toBeInTheDocument();
    expect(screen.getByText('كتاب واحد')).toBeInTheDocument();

    // One link per book, named after it — a column of «فتح الكتاب» is many
    // controls with one name.
    const link = screen.getByRole('link', { name: 'فتح الكتاب: بنك أسئلة المنهج - أولى عربي' });
    expect(link).toHaveAttribute('href', '/library/physics-1/books/book-123');
  });
});
