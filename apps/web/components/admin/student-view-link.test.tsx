import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentViewLink } from './student-view-link';

afterEach(() => {
  cleanup();
});

describe('StudentViewLink', () => {
  it('takes the admin to the student dashboard with their own session', () => {
    render(<StudentViewLink />);
    expect(screen.getByRole('link', { name: 'الصفحة كطالب' }).getAttribute('href')).toBe('/dashboard');
  });

  it('closes the mobile sheet it sits in when pressed', () => {
    const onNavigate = vi.fn();
    render(<StudentViewLink onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('link', { name: 'الصفحة كطالب' }));
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
