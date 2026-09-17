import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
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

  it('turns a line that is ONLY a WhatsApp link into a card, and drops the address', () => {
    /*
     * The bug this is for: a linkified URL is still 55 unbreakable characters,
     * and a chat bubble is about 280px wide on a phone. It ran off the side of
     * the panel — «داخل في الشاشة» — and the reachable part was the middle of
     * an address. The card carries a label instead, so there is nothing left
     * to overflow.
     */
    const { container } = render(
      <MessageBody body={'اشترك من هنا:\nhttps://whatsapp.com/channel/abc\nوهيوصلك كل جديد.'} />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://whatsapp.com/channel/abc');
    // The address itself is GONE from the rendered text — that is the fix.
    expect(container.textContent).not.toContain('https://whatsapp.com/channel/abc');
    // …and the sentences around it are untouched.
    expect(container.textContent).toContain('اشترك من هنا:');
    expect(container.textContent).toContain('وهيوصلك كل جديد.');
  });

  it('names the channel, says what is in it, and shows the button the message points at', () => {
    /*
     * The closer of every invitation now reads «الزرار الأخضر اللي فوق», so
     * the button is not decoration — a message that tells someone to press a
     * green button and then draws no button is a message that lies.
     *
     * The button is a `<span>`: the whole card is already the anchor, and a
     * <button> inside a link is a control nothing can operate.
     */
    render(<MessageBody body="https://whatsapp.com/channel/abc" />);

    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(copy.assistant.thread.whatsappCard.title);
    expect(link).toHaveTextContent(copy.assistant.thread.whatsappCard.lead);
    expect(link).toHaveTextContent(copy.assistant.thread.whatsappCard.action);
    expect(link.querySelector('button')).toBeNull();
  });

  it('leaves a WhatsApp link that shares its line as ordinary inline text', () => {
    // The card is a LINE-level decision. A link with words beside it is part of
    // a sentence and replacing the sentence with a card would eat them.
    render(<MessageBody body="الرابط https://whatsapp.com/channel/abc اتفضل" />);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('https://whatsapp.com/channel/abc');
  });

  it('wraps a long inline URL instead of pushing the bubble sideways', () => {
    // A URL has no break opportunities of its own; without `break-all` one
    // address makes the whole bubble wider than the panel that holds it.
    render(<MessageBody body="شوف https://example.com/a/very/long/path/that/never/breaks كده" />);
    expect(screen.getByRole('link').className).toContain('break-all');
  });

  it('gives a non-WhatsApp link no card, however alone it is on its line', () => {
    // The card names WhatsApp and is WhatsApp green. Any other host getting it
    // would be the interface lying about where the press goes.
    const { container } = render(<MessageBody body={'شوف\nhttps://example.com/x'} />);
    expect(container.textContent).toContain('https://example.com/x');
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

/**
 * «الكورس بتاعك» — the card that goes INWARDS.
 *
 * Three properties, and each is a way it could quietly become something else:
 * it only ever navigates within this site, it only draws for a body the
 * platform wrote, and it draws for a line that is nothing but a course link.
 */
describe('MessageBody — the course card', () => {
  const c = copy.assistant.thread.courseCard;

  it('draws a card with the button every closer points at', () => {
    render(<MessageBody body="https://ayman.test/courses/first-year" trusted />);

    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(c.title);
    expect(link).toHaveTextContent(c.action);
    expect(link.querySelector('button')).toBeNull();
  });

  it('navigates to the PATH, never to the host the message named', () => {
    /*
     * ⚠️ The whole safety argument of this card in one assertion. The stored
     * body carries an absolute URL because that is what was sent and the
     * outreach ledger is a record; the card drops the origin, so no arrangement
     * of message text can make «الكورس بتاعك» point off-site.
     */
    render(<MessageBody body="https://somewhere-else.test/courses/x?ref=1" trusted />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/courses/x?ref=1');
  });

  it('draws nothing for a link a visitor typed', () => {
    // `trusted` defaults to false, so a student pasting a course-shaped URL
    // into their own message gets an ordinary link and no endorsement.
    render(<MessageBody body="https://ayman.test/courses/first-year" />);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('https://ayman.test/courses/first-year');
    expect(link).not.toHaveTextContent(c.action);
  });

  it('leaves a course link that shares its line as inline text', () => {
    render(<MessageBody body="شوف https://ayman.test/courses/x كده" trusted />);
    expect(screen.getByRole('link')).toHaveTextContent('https://ayman.test/courses/x');
  });

  it('gives a non-course path no card', () => {
    render(<MessageBody body="https://ayman.test/news/x" trusted />);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('https://ayman.test/news/x');
    expect(link).not.toHaveTextContent(c.action);
  });

  it('still prefers the WhatsApp card when both could match', () => {
    // A WhatsApp host with a `/courses` path is not a course page. The
    // WhatsApp check runs first and this asserts it stays that way.
    render(<MessageBody body="https://whatsapp.com/courses/x" trusted />);
    expect(screen.getByRole('link')).toHaveTextContent(copy.assistant.thread.whatsappCard.action);
  });
});
