import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageBody } from './message-body';

// Explicit, as every component test in this repo does it — `vitest.setup.ts`
// registers no automatic cleanup.
afterEach(() => {
  cleanup();
});

// The click handler posts to the API. Stubbed at the module boundary so these
// tests are about the RENDER, and so a stray fetch cannot reach the network.
vi.mock('@/lib/whatsapp-opened', () => ({ recordWhatsappOpened: vi.fn() }));

/**
 * «رسايل م. أيمن» sends an invitation whose entire payload is a URL, and the
 * bubble used to render the whole body as one text node — so the link was not
 * a link, and the one message whose only job was to move someone somewhere
 * could not move anyone anywhere.
 *
 * These tests cover the two halves of that fix: the URL becomes an anchor, and
 * NOTHING ELSE does. The second half is the safety argument — there is no HTML
 * sink on this path and this must not become one.
 */
describe('MessageBody', () => {
  it('turns a bare URL into a real link', () => {
    render(<MessageBody body="لينك القناة: https://whatsapp.com/channel/abc" />);

    const link = screen.getByRole('link', { name: 'https://whatsapp.com/channel/abc' });
    expect(link).toHaveAttribute('href', 'https://whatsapp.com/channel/abc');
    expect(link).toHaveAttribute('target', '_blank');
    // `noreferrer` as well: the destination is a third party and has no
    // business learning which page of the platform sent them.
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('keeps the sentence around the link intact', () => {
    const { container } = render(
      <MessageBody body={'اشترك من هنا:\nhttps://whatsapp.com/channel/abc\nوهيوصلك كل جديد.'} />,
    );
    expect(container.textContent).toBe(
      'اشترك من هنا:\nhttps://whatsapp.com/channel/abc\nوهيوصلك كل جديد.',
    );
  });

  it('leaves the full stop out of the href', () => {
    // «…/abc.» — the dot ends the sentence, and swallowing it produces a 404
    // that looks like a broken channel.
    render(<MessageBody body="الرابط https://whatsapp.com/channel/abc." />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://whatsapp.com/channel/abc');
  });

  it('renders a message with no link as plain text and no anchors', () => {
    const body = 'إزيك يا محمد، شفت نتيجتك في «الحلقات».';
    const { container } = render(<MessageBody body={body} />);
    expect(container.textContent).toBe(body);
    expect(container.querySelector('a')).toBeNull();
  });

  it('NEVER renders markup a student typed', () => {
    /*
     * The control on this path has always been the ABSENCE of an HTML sink,
     * not a sanitiser — and this component is the closest anything has come to
     * adding one. It splits a string and returns React elements; a `<script>`
     * in a message body is characters, and must stay characters.
     */
    const body = '<script>alert(1)</script> <b>عريض</b>';
    const { container } = render(<MessageBody body={body} />);

    expect(container.textContent).toBe(body);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('refuses to link a javascript: URL', () => {
    // Not reachable through the composer, which only ever writes an https link
    // an admin configured — but a student can type anything into the same
    // column, and their words render through this same component.
    const { container } = render(<MessageBody body="جرّب javascript:alert(1) دي" />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('links more than one URL in the same message', () => {
    render(<MessageBody body="واحد https://a.example/x واتنين https://b.example/y" />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
