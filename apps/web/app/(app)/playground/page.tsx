import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { Playground } from '@/components/playground/playground';

const c = copy.playground;

export const metadata: Metadata = { title: c.title };

/**
 * `/playground` — somewhere to try something without it counting.
 *
 * ## Why this is not part of a lesson
 *
 * Every other surface that runs code on this platform grades it. A student who
 * wants to check what `for (let i = 1; i <= 10; i++)` actually does should not
 * have to open an exam to find out, and nothing here is stored, submitted or
 * marked — which the subtitle says in as many words, because a platform that
 * records everything else has to be explicit about the one place that doesn't.
 *
 * ## Two languages, and why Python is opt-in
 *
 * JavaScript runs immediately — the browser already has an engine, so
 * `lib/run-code.ts` downloads nothing at all.
 *
 * Python is what the curriculum actually teaches, and it needs a real
 * interpreter compiled to WebAssembly. Pyodide's runtime is 13.5 MB, vendored
 * into `public/pyodide/` at build time (`scripts/vendor-pyodide.mjs`) because
 * `script-src` is `'self'` and a CDN would need a permanent exception.
 *
 * That download is never a side effect of picking Python from the switcher: it
 * is its own button, labelled with the size. A student on Egyptian mobile data
 * who only wants to READ the Python examples never pays for the interpreter,
 * and one who does pay is told what it costs before they press it.
 *
 * Both runners share one `RunResult` shape, so the output panel is unaware of
 * which language produced what it is showing.
 */
export default function PlaygroundPage() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <header className="mb-6">
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.subtitle}</p>
      </header>

      <Playground />

      <p className="mt-4 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.pythonNote} {c.pythonNoPackages}
      </p>
    </main>
  );
}
