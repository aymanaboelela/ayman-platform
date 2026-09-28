import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, type Entitlements } from '@ayman/contracts/admin/entitlements';
import { activeNavItem, visibleNavItems } from './nav-items';

/**
 * «الكتب» got a sidebar row of its own — it had been only the second tab of
 * «طلبات الكتب», and the owner asked for the page while one tab away from it.
 *
 * Two things can quietly undo that: the queue's row (`/admin/books`) is a
 * PREFIX of the shelf's, so a wrong active rule lights both or the wrong one;
 * and the row must follow the `books` feature like the queue does, or a stack
 * that does not sell books grows a link to a page that 404s.
 */

const allOn = Object.fromEntries(FEATURE_KEYS.map((key) => [key, true])) as Entitlements;

describe('the book shelf in the admin sidebar', () => {
  it('lights the shelf on its own page, and the queue on the queue', () => {
    expect(activeNavItem('/admin/books/catalog')?.href).toBe('/admin/books/catalog');
    expect(activeNavItem('/admin/books')?.href).toBe('/admin/books');
    expect(activeNavItem('/admin/books/print')?.href).toBe('/admin/books');
  });

  it('shows to `book:read`, the permission for what is ON SALE', () => {
    const hrefs = visibleNavItems(['book:read'], allOn).map((item) => item.href);
    expect(hrefs).toContain('/admin/books/catalog');
    // …and not the queue, which is `book-order:read` — what somebody BOUGHT.
    expect(hrefs).not.toContain('/admin/books');
  });

  it('disappears with the books feature, like the queue beside it', () => {
    const hrefs = visibleNavItems(['book:read', 'book-order:read'], {
      ...allOn,
      books: false,
    }).map((item) => item.href);
    expect(hrefs).not.toContain('/admin/books/catalog');
    expect(hrefs).not.toContain('/admin/books');
  });
});
