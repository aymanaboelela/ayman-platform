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

  /* ── A link that we know how to open here ──────────────────────────────
   *
   * All three cases are the SAME stored row: kind `link`, a plain URL. What
   * differs is only what the renderer recognises in it.
   */

  it('a YouTube link plays in the lesson instead of sending the student to youtube.com', () => {
    render(
      <ResourceList
        resources={[resource({ id: 'r-yt', kind: 'link', title: 'شرح إضافي', linkUrl: 'https://youtu.be/dQw4w9WgXcQ' })]}
      />,
    );

    const frame = screen.getByTitle('شرح إضافي');
    expect(frame.tagName).toBe('IFRAME');
    // Rebuilt from the id, on the nocookie host — not the pasted URL.
    expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    // The door out is still there: a video whose owner disabled embedding
    // renders as a refusal, and the student must not be stuck with it.
    expect(screen.getByRole('link', { name: copy.player.openInNewTab })).toHaveAttribute(
      'href',
      'https://youtu.be/dQw4w9WgXcQ',
    );
  });

  it('a Drive link previews in the lesson, on the read-only viewer', () => {
    const id = '1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv';
    render(
      <ResourceList
        resources={[
          resource({
            id: 'r-drive',
            kind: 'link',
            title: 'ملزمة',
            linkUrl: `https://drive.google.com/file/d/${id}/view?usp=sharing`,
          }),
        ]}
      />,
    );

    expect(screen.getByTitle('ملزمة')).toHaveAttribute(
      'src',
      `https://drive.google.com/file/d/${id}/preview`,
    );
  });

  it('a host we do not recognise keeps the card it always had', () => {
    render(<ResourceList resources={[link]} />);
    // Unchanged behaviour: an anchor to the pasted URL, its hostname shown so
    // the destination is legible before the click.
    const anchor = screen.getByRole('link', { name: /مرجع خارجي/ });
    expect(anchor).toHaveAttribute('href', 'https://example.com/notes');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(screen.queryByTitle('مرجع خارجي')).toBeNull();
  });

  it('refuses a lookalike host — the embed is not chosen by substring', () => {
    const id = '1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv';
    render(
      <ResourceList
        resources={[
          resource({
            id: 'r-evil',
            kind: 'link',
            title: 'مزيّف',
            linkUrl: `https://drive.google.com.evil.example/file/d/${id}/view`,
          }),
        ]}
      />,
    );

    expect(screen.queryByTitle('مزيّف')).toBeNull();
    expect(screen.getByRole('link', { name: /مزيّف/ })).toBeInTheDocument();
  });
});
