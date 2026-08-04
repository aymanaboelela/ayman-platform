import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { ESSENTIAL_TERMS } from '@/lib/essentials-terms';

const e = copy.essentials;

export const metadata: Metadata = { title: e.appTitle };

/**
 * The twelve terms, inside the student shell.
 *
 * ## Why this exists next to the public `/essentials`
 *
 * Same twelve definitions, different reader. `/essentials` is a marketing
 * page: a liquid hero, a WARM-UP badge, and a closing «اختار صفّك» — all of
 * which are wrong for someone who has already chosen their year and is looking
 * something up mid-lesson. Clicking «التأسيس» in the rail used to leave the
 * dashboard entirely to land there.
 *
 * The definitions themselves come from `lib/essentials-terms.ts`, which both
 * pages read. Two copies of a glossary drift the first time either definition
 * is retouched.
 *
 * ## Why it is a plain static grid
 *
 * No search box, no filter, no client component. Twelve items fit on one
 * screen at desktop widths and are one `⌘F` away everywhere else; a search
 * input over twelve rows is chrome that costs a hydration boundary and saves
 * nobody a scroll.
 */
export default function FoundationsPage() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <header className="mb-8">
        <p className="eyebrow mb-2 text-fg-muted">{e.appEyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{e.appTitle}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{e.appSubtitle}</p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ESSENTIAL_TERMS.map((term, index) => (
          <li className="panel flex flex-col gap-2 p-4" key={term.en}>
            <div className="flex items-baseline justify-between gap-3">
              {/* The English keyword is a CODE token, not prose: it keeps the
                  mono face and an explicit `dir="ltr"`, because `Input / Output`
                  reorders around the slash under the page's RTL base direction. */}
              <span
                dir="ltr"
                className="mono text-[length:var(--fs-mono-label)] text-accent-text"
              >
                {term.en}
              </span>
              <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
            <h2 className="text-[length:var(--fs-title-4)] font-medium text-fg">{term.ar}</h2>
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{term.body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
