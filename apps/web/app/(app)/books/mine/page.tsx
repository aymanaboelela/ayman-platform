import type { Metadata } from 'next';
import Link from 'next/link';
import { PackageOpen } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { BookOrderCard } from '@/components/dashboard/my-book-orders-section';
import { getMyBookOrdersOrEmpty, newestFirst } from '@/lib/my-book-orders';
import { getPublicSettingsOrDefaults } from '@/lib/settings';

export const metadata: Metadata = { title: copy.books.mine.pageTitle };

const c = copy.books.mine;

/**
 * «كل طلباتي» — every printed book this student ever ordered, and where each
 * one got to.
 *
 * ## Why it is `/books/mine` and not `/books`
 *
 * `app/(site)/books/page.tsx` already owns `/books`: the shop, in the marketing
 * shell, built from `.site-*` and `books.css`. Two route groups may not resolve
 * to the same URL, and they should not want to — that page sells to a visitor
 * who may have no account, this one is one student's own delivery history and
 * carries their address on every row. A segment underneath it inside the app
 * shell is both the only legal shape and the correct one.
 *
 * ## Why the dashboard card is not enough on its own
 *
 * The card shows two orders, because it answers «فين كتابي» — a question about
 * the thing still moving. This answers «إيه اللي طلبته», which is a different
 * question with a different shape: every order, oldest last, with its lines,
 * its breakdown and its dates. It is also where all three book notifications
 * land, so it has to be complete rather than recent.
 *
 * ## Failure
 *
 * `getMyBookOrdersOrEmpty` swallows its own error and returns `[]`, so an
 * unreachable API renders the empty state rather than «حصل خطأ». That is a
 * deliberate trade and it is the RIGHT one here even though `[]` is ambiguous:
 * the alternative is a student who is worried about a book being handed an
 * error page, and the empty state's own action — «شوف الكتب» — leads somewhere
 * useful in both readings. The card on the dashboard makes the same trade for
 * the same reason; see `lib/my-book-orders.ts`.
 *
 * Two reads in parallel rather than in sequence: the orders are authenticated
 * and per-request, the contact block is `'use cache'` on the hour and shared
 * with every other page, so awaiting them one after the other would make this
 * page wait for a round trip it does not need to.
 */
export default async function MyBookOrdersPage() {
  const [orders, settings] = await Promise.all([
    getMyBookOrdersOrEmpty(),
    /* `…OrDefaults`, never `getPublicSettings()`: a settings read that throws
       must not take down a page whose subject is somewhere else entirely. No
       number configured means no «كلّم الدعم» link, which is the same state a
       fresh install is in. */
    getPublicSettingsOrDefaults(),
  ]);

  const supportHref = waMeHref(settings.contact.whatsapp);

  return (
    <main className="mx-auto w-full max-w-[var(--w-prose)] px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{c.pageTitle}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.pageLead}</p>
      </header>

      {orders.length === 0 ? (
        /*
          `.empty` — the same object the dashboard's own empty states use, and
          ember-tinted rather than a dashed grey rectangle, which is
          indistinguishable from something that failed to load.

          A lucide glyph rather than a `<SpotIllustration>`: that set has four
          drawings and none of them is a parcel, and inventing a fifth belongs to
          whoever owns that file.
        */
        <div className="empty">
          <PackageOpen className="mx-auto size-10 text-fg-faint" aria-hidden="true" />
          <p className="empty__title">{c.empty}</p>
          <p className="empty__body mx-auto max-w-[34rem]">{c.emptyNote}</p>
          <div className="empty__action">
            <Link href="/books" className="chip chip--solid">
              {c.emptyCta}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {newestFirst(orders).map((order) => (
              <BookOrderCard key={order.id} order={order} supportHref={supportHref} />
            ))}
          </ul>

          {/* The one action a student who has read their history might want
              next. Outlined amber rather than filled, for the same reason it is
              outlined on the dashboard: this page's subject is what they already
              have, not what to buy. */}
          <div className="mt-6">
            <Link href="/books" className="chip chip--accent">
              {c.orderAnother}
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
