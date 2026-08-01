import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerResource } from '@ayman/contracts';
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

  it('gives a file resource both an in-page viewer and a download', () => {
    render(<ResourceList resources={[deck]} />);

    expect(screen.getByTitle('المحاضرة الأولى')).toHaveAttribute(
      'src',
      '/api/lessons/l1/resources/r-deck/view',
    );
    expect(screen.getByRole('link', { name: /تحميل/ })).toHaveAttribute(
      'href',
      '/api/lessons/l1/resources/r-deck/download',
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
    expect(screen.queryByRole('link', { name: /تحميل/ })).toBeNull();
  });

  it('renders a mixed set in the order given', () => {
    render(<ResourceList resources={[deck, video, link]} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['المحاضرة الأولى', 'فيديو شرح', 'مرجع خارجي']);
  });
});
