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
 * ## Language: JavaScript, and why there is no picker
 *
 * The founder asked for a language selector and the honest answer today is a
 * single language, stated plainly rather than a dropdown with one entry.
 *
 * JavaScript runs because the browser already has an engine for it —
 * `lib/run-code.ts` needs no download at all. Python, which is what the
 * curriculum actually teaches, needs a full interpreter compiled to WebAssembly
 * (Pyodide, ~13.9 MB unpacked). That is a real slice of work, not a flag: the
 * assets have to be self-hosted because `script-src` is `'self'`, the CSP needs
 * `'wasm-unsafe-eval'`, and a student on Egyptian mobile data must not be made
 * to pull 13 MB without being asked first.
 *
 * A `<select>` listing Python and refusing to run it would be worse than this
 * label. When Python ships, the label becomes the picker.
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

      <p className="mt-4 text-[length:var(--fs-text-sm)] text-fg-muted">{c.languageNote}</p>
    </main>
  );
}
