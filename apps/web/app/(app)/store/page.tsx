import { copy } from '@ayman/contracts';
import { BooksShippingChip, BooksShop } from '@/components/site/books-shop';
import { getBookCatalogOrEmpty } from '@/lib/books';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
// The shop's stylesheet, shared verbatim with `/books`. `store.css` is the
// adapter that makes it read the app's palette — see the header in that file.
import '../../(site)/styles/books.css';
import './store.css';

const c = copy.books;

export const metadata = { title: c.pageTitle };

/**
 * «الكتب», inside the student shell.
 *
 * ## Why this route exists at all when `/books` already does
 *
 * `/books` is the marketing shop and stays exactly that — public, indexed,
 * site chrome, the URL every WhatsApp message and the footer already point at.
 * It was also the rail's «الكتب» entry, which meant a signed-in student who
 * pressed it was thrown out of the app: no rail, no topbar, marketing header
 * instead, and no way back except the browser's own button. Reported with a
 * screenshot — «متفتحهاش صفحة لوحدها».
 *
 * The two cannot be one route. A route group is not a URL segment, so
 * `(app)/books` and `(site)/books` would both resolve to `/books` and Next
 * refuses the build. Rendering one page under two chromes was the other option
 * and is worse: the `(site)` layout carries the dot grid, the cursor splash,
 * the smooth-scroll driver and the MCP provider, and the `(app)` layout
 * composes four independently-suspended shell slots — a page that picked
 * between them at render time would own a copy of both.
 *
 * So: same component, same stylesheet, second URL. `/store` is `noindex` by
 * inheritance (`privateRouteMetadata` on the group layout), so there is no
 * duplicate-content question to answer.
 *
 * ## What is NOT duplicated
 *
 * `<BooksShop>` — the shelves, the basket, the stepper, the checkout dialog and
 * the whole `BookOrderPanel` flow — is imported, not copied. `books.css` is
 * imported, not copied. The only thing this route owns is `store.css`, which
 * re-points sixteen `--site-*` tokens at the app's own and neutralises three
 * offsets written for the marketing header.
 *
 * ## Failure containment
 *
 * `getBookCatalogOrEmpty` and `getPublicSettingsOrDefaults`, never their
 * throwing twins — the same rule `(site)/books/page.tsx` states, and the same
 * one `/admin/students` was fixed under: an uncached read that throws is the
 * student's whole page. Both are cached and both answer with an empty shape
 * rather than an exception.
 */
export default async function StorePage() {
  const [catalog, { contact }] = await Promise.all([
    getBookCatalogOrEmpty(),
    getPublicSettingsOrDefaults(),
  ]);

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      {/*
        `.study-head`, not `.books-hero`. The marketing hero is a full-bleed
        tinted band that opens a page with nothing above it; here the topbar is
        already the top of the screen, and every other shell route
        (`/library`, `/foundations`, `/path`) opens with this exact object. A
        second kind of page opening on one surface is how a product starts
        looking assembled from parts.
      */}
      <header className="study-head">
        <p className="eyebrow mb-2 text-fg-muted">{c.badge}</p>
        <h1 className="study-head__title">{c.pageTitle}</h1>
        <p className="study-head__lead">{c.lead}</p>
      </header>

      <div className="store-surface mt-6">
        {/* The delivery fee on the shelf rather than only at checkout — the
            same call `(site)/books` makes, for the same reason: at these
            prices «٦٥ جنيه شحن» is not fine print. */}
        <BooksShippingChip shippingCents={catalog.shippingCents} />

        <BooksShop catalog={catalog} vodafoneCash={contact.vodafoneCash} />
      </div>
    </main>
  );
}
