import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy, type PlayerResource } from '@ayman/contracts';
import { ResourceList } from './resource-list';

// `globals` is off in vitest.config.ts, so RTL's automatic cleanup never
// registers. Every component test in this package unmounts explicitly —
// without it, renders accumulate and `getByText` starts finding duplicates.
afterEach(() => {
  cleanup();
});

function resource(overrides: Partial<PlayerResource> & Pick<PlayerResource, 'kind'>): PlayerResource {
  return {
    id: 'r1',
    title: 'مادة',
    description: null,
    filename: null,
    mime: null,
    sizeBytes: null,
    youtubeId: null,
    linkUrl: null,
    viewPath: null,
    downloadPath: null,
    ...overrides,
  };
}

const deck = resource({
  id: 'r-deck',
  kind: 'presentation',
  title: 'المحاضرة الأولى',
  description: 'شرح الفصل الأول',
  filename: 'lecture-1.pdf',
  mime: 'application/pdf',
  sizeBytes: 2048,
  viewPath: '/api/lessons/l1/resources/r-deck/view',
  downloadPath: '/api/lessons/l1/resources/r-deck/download',
});

const link = resource({
  id: 'r-link',
  kind: 'link',
  title: 'مرجع خارجي',
  linkUrl: 'https://example.com/notes',
});

const video = resource({
  id: 'r-vid',
  kind: 'video',
  title: 'فيديو شرح',
  youtubeId: 'dQw4w9WgXcQ',
});

describe('ResourceList', () => {
  it('renders the empty state when there is nothing', () => {
    render(<ResourceList resources={[]} />);
    expect(screen.getByText('مفيش مواد مرفوعة للدرس ده.')).toBeInTheDocument();
  });

  it('gives a file resource a download immediately, and a viewer on request', () => {
    render(<ResourceList resources={[deck]} />);

    /*
     * CLOSED first, and that is the assertion — not an inconvenience the test
     * has to click past.
     *
     * The viewer used to render on sight, so every video lesson carried a
     * 36rem PDF nobody had opened: «مش عايز PDF يكون ظهر لي على طول». If it
     * ever comes back this line fails, which is the point.
     */
    expect(screen.queryByTitle('المحاضرة الأولى')).toBeNull();

    // The download stays one press away at all times — it is the thing most
    // students want, and it never depended on the preview.
    expect(screen.getByRole('link', { name: copy.player.download })).toHaveAttribute(
      'href',
      '/api/lessons/l1/resources/r-deck/download',
    );

    // `fireEvent`, not `user-event`: this package does not depend on the
    // latter, and a click is the whole interaction — nothing here needs the
    // pointer/keyboard sequence `user-event` exists to simulate.
    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByTitle('المحاضرة الأولى')).toHaveAttribute(
      'src',
      '/api/lessons/l1/resources/r-deck/view',
    );
  });

  it('never puts a storage key in the markup', () => {
    const { container } = render(<ResourceList resources={[deck]} />);
    expect(container.innerHTML).not.toContain('doc/');
    expect(container.innerHTML).toContain('/api/lessons/');
  });

  it('marks the presentation as the main one', () => {
    render(<ResourceList resources={[deck]} />);
    expect(screen.getByText('البريزنتيشن الأساسي')).toBeInTheDocument();
  });

  it('shows the description when there is one', () => {
    render(<ResourceList resources={[deck]} />);
    expect(screen.getByText('شرح الفصل الأول')).toBeInTheDocument();
  });

  it('renders an external link with noopener/noreferrer and shows its hostname', () => {
    render(<ResourceList resources={[link]} />);

    const anchor = screen.getByRole('link', { name: /مرجع خارجي/ });
    expect(anchor).toHaveAttribute('href', 'https://example.com/notes');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor.getAttribute('rel')).toContain('noopener');
    expect(anchor.getAttribute('rel')).toContain('noreferrer');
    // The destination is legible before the click.
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('builds the video embed from the id, never from a stored URL', () => {
    const { container } = render(<ResourceList resources={[video]} />);

    expect(screen.getByTitle('فيديو شرح')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    // youtube-nocookie, never youtube.com.
    expect(container.innerHTML).not.toContain('//www.youtube.com');
  });

  it('gives video and link resources no viewer and no download affordance', () => {
    render(<ResourceList resources={[video, link]} />);
    expect(screen.queryByRole('link', { name: copy.player.download })).toBeNull();
  });

  it('renders a mixed set in the order given', () => {
    render(<ResourceList resources={[deck, video, link]} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['المحاضرة الأولى', 'فيديو شرح', 'مرجع خارجي']);
  });
});
