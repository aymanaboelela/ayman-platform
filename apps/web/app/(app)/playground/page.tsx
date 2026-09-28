import type { Metadata } from 'next';
import { Cpu, Library, Sparkles } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { LanguageBadge, Playground } from '@/components/playground/playground';
import { PlaygroundArt } from '@/components/playground/playground-art';
import { ALL_EXAMPLES } from '@/lib/playground/examples';
import '@/components/playground/playground.css';

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
 * ## Three languages, and why each one runs where it does
 *
 * JavaScript runs immediately — the browser already has an engine, so
 * `lib/run-code.ts` downloads nothing at all.
 *
 * Python is what the curriculum actually teaches, and it needs a real
 * interpreter compiled to WebAssembly. Pyodide's runtime is 13.5 MB, vendored
 * into `public/pyodide/` at build time (`scripts/vendor-pyodide.mjs`) because
 * `script-src` is `'self'` and a CDN would need a permanent exception. That
 * download is never a side effect of picking Python: it is its own button,
 * labelled with the size.
 *
 * HTML + CSS renders the student's page in a sandboxed frame with its own
 * no-network policy (`lib/html-preview.ts`) — the one place on the platform
 * where somebody else's markup and script run, and so the one place built to
 * reach nothing.
 *
 * ## Why it is colourful
 *
 * The first version was two grey boxes, and to the people this is for that
 * read as a form, not a toy. The hero, the window chrome and the example cards
 * are the page telling a sixteen-year-old "this is where you play" — every
 * colour in them is a chart token, and the drawing names nobody, so the same
 * page works on every teacher's stack.
 */
export default function PlaygroundPage() {
  return (
    <main className="pg mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <header className="pg-hero">
        <div className="pg-hero__glyphs" aria-hidden="true">
          <span className="pg-glyph pg-glyph--a">{'{ }'}</span>
          <span className="pg-glyph pg-glyph--b">{'</>'}</span>
          <span className="pg-glyph pg-glyph--c">#</span>
          <span className="pg-glyph pg-glyph--d">{'=>'}</span>
        </div>

        <div className="pg-hero__copy">
          <span className="pg-hero__pill">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {c.heroPill}
          </span>
          <h1 className="pg-hero__title">{c.title}</h1>
          <p className="pg-hero__lead">{c.subtitle}</p>

          <ul className="pg-hero__chips">
            {(['js', 'python', 'web'] as const).map((language) => (
              <li key={language} className="pg-hero__chip" data-lang={language}>
                <LanguageBadge language={language} />
                <span className="pg-hero__chip-name">
                  {language === 'js' ? c.js : language === 'python' ? c.python : c.web}
                </span>
              </li>
            ))}
            <li className="pg-hero__chip pg-hero__chip--glow">
              <Library className="size-3.5" aria-hidden="true" />
              {c.heroExamples.replace('{n}', String(ALL_EXAMPLES.length))}
            </li>
            <li className="pg-hero__chip">
              <Cpu className="size-3.5" aria-hidden="true" />
              {c.heroLocal}
            </li>
          </ul>
        </div>

        <div className="pg-hero__visual">
          <PlaygroundArt />
        </div>
      </header>

      <div className="mt-6">
        <Playground />
      </div>

      <p className="pg-note">
        {c.pythonNote} {c.pythonNoPackages}
      </p>
      <p className="pg-note">{c.previewSandboxNote}</p>
    </main>
  );
}
