'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AppWindow,
  ArrowDownUp,
  Calculator,
  ChartColumn,
  Check,
  ClipboardList,
  Clock,
  Copy,
  Dices,
  Download,
  FormInput,
  GitBranch,
  Grid3x3,
  Hand,
  Heart,
  IdCard,
  Info,
  LayoutGrid,
  Library,
  ListOrdered,
  Lock,
  MousePointerClick,
  Orbit,
  Play,
  RefreshCw,
  Repeat,
  Rocket,
  RotateCcw,
  Sigma,
  SquareFunction,
  SquareTerminal,
  Triangle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import {
  EXAMPLES_BY_LANGUAGE,
  JS_EXAMPLES,
  PY_EXAMPLES,
  WEB_EXAMPLES,
  type ExampleIcon,
  type PlaygroundExample,
  type PlaygroundLanguage,
} from '@/lib/playground/examples';
import { hasScript } from '@/lib/playground/preview-document';
import { runCode, type RunResult } from '@/lib/run-code';
import { isPythonBooted, resetPython, runPython } from '@/lib/run-python';
import { HtmlPreview, type PreviewLine, type PreviewRequest } from './html-preview';

const c = copy.playground;

const LANGUAGES: readonly PlaygroundLanguage[] = ['js', 'python', 'web'];

const LANGUAGE_NAME: Record<PlaygroundLanguage, string> = {
  js: c.js,
  python: c.python,
  web: c.web,
};

/** What the little coloured badge says. Glyphs, not logos. */
const BADGE: Record<PlaygroundLanguage, string> = { js: 'JS', python: 'Py', web: '</>' };

const FILE_NAME = { js: 'main.js', python: 'main.py', html: 'index.html', css: 'style.css' } as const;

const ICONS: Record<ExampleIcon, LucideIcon> = {
  hello: Hand,
  branch: GitBranch,
  loop: Repeat,
  function: SquareFunction,
  list: ListOrdered,
  pyramid: Triangle,
  grid: Grid3x3,
  dice: Dices,
  sort: ArrowDownUp,
  chart: ChartColumn,
  prime: Sigma,
  heart: Heart,
  report: ClipboardList,
  page: AppWindow,
  card: IdCard,
  rocket: Rocket,
  orbit: Orbit,
  form: FormInput,
  layout: LayoutGrid,
  buttons: MousePointerClick,
  counter: Calculator,
  clock: Clock,
};

/** How long typing has to pause before a live preview refreshes. */
const LIVE_DELAY_MS = 450;

/** A runaway `console.log` loop in a page should not grow this list forever. */
const WEB_LINE_LIMIT = 300;

interface Drafts {
  js: { exampleId: string; code: string };
  python: { exampleId: string; code: string };
  web: { exampleId: string; html: string; css: string };
}

const INITIAL_DRAFTS: Drafts = {
  js: { exampleId: JS_EXAMPLES[0]!.id, code: JS_EXAMPLES[0]!.code },
  python: { exampleId: PY_EXAMPLES[0]!.id, code: PY_EXAMPLES[0]!.code },
  web: { exampleId: WEB_EXAMPLES[0]!.id, html: WEB_EXAMPLES[0]!.html, css: WEB_EXAMPLES[0]!.css },
};

type Status = 'idle' | 'running' | 'done' | 'error';

/** A run and how long it took — «خلص في ١٢ مللي ثانية» in the status chip. */
async function timed<T>(work: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const value = await work();
  return [value, Math.round(performance.now() - started)];
}

export function LanguageBadge({ language }: { language: PlaygroundLanguage }) {
  return (
    <span className="pg-badge" data-lang={language} aria-hidden="true">
      {BADGE[language]}
    </span>
  );
}

/**
 * The workbench: an editor, whatever the code produced, and a library of
 * programs to start from.
 *
 * ## Three languages, one evaluator each, none of them trusted
 *
 * - **JavaScript** runs in `lib/run-code.ts`'s throwaway worker — no DOM, no
 *   network, a 2.5 s kill switch — shared with the landing page's lab, so there
 *   is one evaluator to get right, not two.
 * - **Python** runs in Pyodide (`lib/run-python.ts`), and its 13.5 MB download
 *   is a button the student presses, never a side effect of picking the tab.
 * - **HTML + CSS** renders in `HtmlPreview`: a sandboxed frame in an opaque
 *   origin under its own no-network policy. The student's `<script>` runs
 *   there and reaches nothing — not the API, not the cookies, not this page.
 *
 * ## Why still a textarea and not a code editor
 *
 * CodeMirror and Monaco are 200kB+ of JavaScript for syntax colouring on a
 * page whose job is "type a few lines and press run". A `<textarea>` with the
 * mono face, `dir="ltr"`, no spellcheck, tab-to-indent and a line-number gutter
 * covers that, works with a phone keyboard, and stays reachable by a screen
 * reader without an ARIA grid. The window chrome around it is what makes it
 * read as an editor; the bytes stay where they are.
 *
 * ## Drafts per language
 *
 * Switching from JavaScript to Python and back keeps what was typed in each —
 * a student comparing how the two say the same thing should not lose one side
 * of the comparison to a tab click. Nothing is stored anywhere; a reload is a
 * clean slate, which the page says in its subtitle.
 */
export function Playground() {
  const [language, setLanguage] = useState<PlaygroundLanguage>('js');
  const [drafts, setDrafts] = useState<Drafts>(INITIAL_DRAFTS);
  const [file, setFile] = useState<'html' | 'css'>('html');
  const [result, setResult] = useState<RunResult | null>(null);
  const [runMs, setRunMs] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [pythonReady, setPythonReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<PlaygroundLanguage>('js');

  const [previewRequest, setPreviewRequest] = useState<PreviewRequest | null>(null);
  const [webLines, setWebLines] = useState<readonly PreviewLine[]>([]);
  const [webStatus, setWebStatus] = useState<'idle' | 'running' | 'done' | 'hung'>('idle');
  const [live, setLive] = useState(true);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const workRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLElement>(null);

  // The two timers are the only things here that can outlive the screen.
  useEffect(
    () => () => {
      if (liveTimer.current) clearTimeout(liveTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const web = drafts.web;
  const value = language === 'web' ? (file === 'html' ? web.html : web.css) : drafts[language].code;
  const lineCount = value.split('\n').length;
  const examples = EXAMPLES_BY_LANGUAGE[language];
  const currentExampleId = drafts[language].exampleId;
  const needsPythonDownload = language === 'python' && !pythonReady;
  const pageHasScript = language === 'web' && hasScript(web.html);

  /**
   * On a phone the output sits under the editor, often below the fold — so a
   * press of «تشغيل» would change something the student cannot see. Only then
   * does the page scroll; with the two panes side by side it never moves.
   */
  function revealOutput() {
    const panel = outputRef.current;
    if (!panel) return;
    if (panel.getBoundingClientRect().top < window.innerHeight - 120) return;
    const smooth = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    panel.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  }

  async function runSource(lang: 'js' | 'python', source: string) {
    setRunning(true);
    const [next, ms] = await timed(() => (lang === 'python' ? runPython(source) : runCode(source)));
    setRunMs(ms);
    setResult(next);
    if (lang === 'python') setPythonReady(isPythonBooted());
    setRunning(false);
  }

  function renderPage(html: string, css: string) {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    setWebLines([]);
    setWebStatus('running');
    setPreviewRequest({ html, css });
  }

  function run() {
    if (running) return;
    if (language === 'web') renderPage(web.html, web.css);
    else void runSource(language, drafts[language].code);
    revealOutput();
  }

  /**
   * Downloading 13.5 MB is a decision, so it is a button press and not a side
   * effect of choosing Python. Booting is the same call as running —
   * `runPython('')` boots and executes nothing — so there is no second code
   * path that could boot differently from the one every run goes through.
   */
  async function loadPython() {
    setRunning(true);
    const boot = await runPython('');
    setPythonReady(isPythonBooted());
    // A boot failure has to surface, or the button just stops spinning and the
    // student is left pressing Run against an interpreter that never arrived.
    if (boot.error) setResult(boot);
    setRunning(false);
  }

  function switchLanguage(next: PlaygroundLanguage) {
    if (next === language) return;
    setLanguage(next);
    setFilter(next);
    setResult(null);
    setRunMs(null);
    setFile('html');
    // The browser pane is empty until something renders, and rendering costs
    // no network at all — so HTML arrives already showing its page.
    if (next === 'web') renderPage(drafts.web.html, drafts.web.css);
  }

  function loadExample(example: PlaygroundExample, { autoRun }: { autoRun: boolean }) {
    setLanguage(example.language);
    setResult(null);
    setRunMs(null);
    if (example.language === 'web') {
      setDrafts((d) => ({ ...d, web: { exampleId: example.id, html: example.html, css: example.css } }));
      setFile('html');
      renderPage(example.html, example.css);
    } else {
      const lang = example.language;
      setDrafts((d) => ({ ...d, [lang]: { exampleId: example.id, code: example.code } }));
      // Python only runs itself once the interpreter is already here — the
      // download stays the student's call.
      if (autoRun && (lang === 'js' || pythonReady)) void runSource(lang, example.code);
    }
    requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.scrollTop = 0;
    });
  }

  function tryFromGallery(example: PlaygroundExample) {
    loadExample(example, { autoRun: true });
    const smooth = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    workRef.current?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  }

  function resetExample() {
    const example = examples.find((e) => e.id === currentExampleId) ?? examples[0]!;
    loadExample(example, { autoRun: false });
  }

  /** A clean interpreter, for when leftover variables are the problem. */
  function restartPython() {
    resetPython();
    setPythonReady(false);
    setResult(null);
    setRunMs(null);
  }

  function edit(next: string) {
    if (language !== 'web') {
      const lang = language;
      setDrafts((d) => ({ ...d, [lang]: { ...d[lang], code: next } }));
      return;
    }
    const html = file === 'html' ? next : web.html;
    const css = file === 'css' ? next : web.css;
    setDrafts((d) => ({ ...d, web: { ...d.web, html, css } }));
    // Live refresh only for a page with no script in it. A half-typed
    // `for (…; i--)` would otherwise run on every pause in typing — and on a
    // browser that keeps sandboxed frames in-process, a loop in the frame is a
    // loop in this tab.
    if (liveTimer.current) clearTimeout(liveTimer.current);
    if (live && !hasScript(html)) {
      liveTimer.current = setTimeout(() => renderPage(html, css), LIVE_DELAY_MS);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied (insecure context, or the user declined). The button
      // simply does not confirm; there is nothing useful to say about it.
    }
  }

  /**
   * Tab indents instead of leaving the field; Ctrl/⌘+Enter runs.
   *
   * Tab traps a key keyboard users rely on to escape, so Escape-then-Tab still
   * works: Escape blurs the textarea, restoring normal navigation — the
   * accepted way to make a code field usable without making it a trap.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!needsPythonDownload) run();
      return;
    }
    if (event.key !== 'Tab' || event.shiftKey) return;
    event.preventDefault();
    const el = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    // Four spaces is what PEP 8 says and what every Python tutorial shows.
    const indent = language === 'python' ? '    ' : '  ';
    edit(`${value.slice(0, start)}${indent}${value.slice(end)}`);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + indent.length;
    });
  }

  /** The gutter is a separate element, so it follows the textarea's scroll. */
  function syncGutter(event: React.UIEvent<HTMLTextAreaElement>) {
    if (gutterRef.current) {
      gutterRef.current.style.transform = `translateY(${-event.currentTarget.scrollTop}px)`;
    }
  }

  const status: Status =
    language === 'web'
      ? webStatus === 'hung' || webLines.some((line) => line.level === 'error')
        ? 'error'
        : webStatus === 'running'
          ? 'running'
          : webStatus === 'done'
            ? 'done'
            : 'idle'
      : running
        ? 'running'
        : result === null
          ? 'idle'
          : result.error
            ? 'error'
            : 'done';

  const statusText =
    status === 'running'
      ? c.running
      : status === 'error'
        ? c.statusError
        : status === 'done'
          ? language === 'web'
            ? c.statusRendered
            : c.statusDone.replace('{ms}', String(runMs ?? 0))
          : c.statusIdle;

  const statusChip = (
    <span className="pg-status" data-state={status}>
      <span className="pg-status__dot" aria-hidden="true" />
      {statusText}
    </span>
  );

  return (
    <div className="pg-app">
      <div className="pg-work" ref={workRef}>
        {/* ── Editor ─────────────────────────────────────────────────── */}
        <div className="pg-window" data-lang={language}>
          <div className="pg-bar">
            <span className="pg-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <div role="group" aria-label={c.languageLabel} className="pg-langs">
              {LANGUAGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  data-lang={option}
                  onClick={() => switchLanguage(option)}
                  aria-pressed={language === option}
                  className="pg-lang"
                >
                  <LanguageBadge language={option} />
                  <span className="pg-lang__name">{LANGUAGE_NAME[option]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pg-files">
            {language === 'web' ? (
              <div role="group" aria-label={c.filesLabel} className="pg-files__tabs">
                {(['html', 'css'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="pg-file"
                    aria-pressed={file === option}
                    onClick={() => setFile(option)}
                  >
                    <span
                      className={option === 'css' ? 'pg-file__dot pg-file__dot--css' : 'pg-file__dot'}
                      aria-hidden="true"
                    />
                    {FILE_NAME[option]}
                  </button>
                ))}
              </div>
            ) : (
              <span className="pg-file pg-file--static">
                <span className="pg-file__dot" aria-hidden="true" />
                {FILE_NAME[language]}
              </span>
            )}

            <span className="pg-files__meta tabular">{c.lines.replace('{n}', String(lineCount))}</span>

            <label className="pg-files__pick">
              <span className="sr-only">{c.examplesLabel}</span>
              <select
                value={currentExampleId}
                onChange={(event) => {
                  const example = examples.find((e) => e.id === event.target.value);
                  if (example) loadExample(example, { autoRun: false });
                }}
              >
                {examples.map((example) => (
                  <option value={example.id} key={example.id}>
                    {example.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* `dir="ltr"` is load-bearing, not cosmetic: the page's base
              direction is RTL, and code left to inherit it reorders brackets
              and operators into something that is not the program. */}
          <div className="pg-code" dir="ltr">
            <div className="pg-code__gutter" aria-hidden="true">
              <div ref={gutterRef} className="pg-code__nums">
                {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
              </div>
            </div>
            <textarea
              ref={editorRef}
              value={value}
              onChange={(event) => edit(event.target.value)}
              onKeyDown={onKeyDown}
              onScroll={syncGutter}
              dir="ltr"
              wrap="off"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label={c.editorLabel}
              className="pg-code__input"
            />
          </div>

          <div className="pg-actions">
            {/* Python that has not booted yet shows the DOWNLOAD instead of
                Run. One primary action at a time: a Run button that silently
                pulls 13.5 MB before doing anything is what this avoids. */}
            {needsPythonDownload ? (
              <button
                type="button"
                onClick={() => void loadPython()}
                disabled={running}
                className="pg-btn pg-btn--run"
              >
                <Download size={16} aria-hidden="true" />
                {running ? c.pythonLoading : c.pythonLoad}
              </button>
            ) : (
              <button type="button" onClick={run} disabled={running} className="pg-btn pg-btn--run">
                <Play size={16} aria-hidden="true" />
                {running ? c.running : c.run}
              </button>
            )}

            <button type="button" onClick={resetExample} className="pg-btn">
              <RotateCcw size={15} aria-hidden="true" className="icon-inline" />
              {c.reset}
            </button>

            <button type="button" onClick={() => void copyCode()} className="pg-btn">
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? c.copied : c.copy}
            </button>

            {/* Only once there is an interpreter to restart. A persistent
                worker keeps variables between runs (see `lib/run-python.ts`),
                which is what a notebook does — this is the escape hatch when
                that is the problem. */}
            {language === 'python' && pythonReady ? (
              <button type="button" onClick={restartPython} className="pg-btn pg-btn--quiet">
                <RotateCcw size={15} aria-hidden="true" className="icon-inline" />
                {c.resetRuntime}
              </button>
            ) : null}

            <span className="pg-kbd">{c.shortcut}</span>
          </div>
        </div>

        {/* ── Output ─────────────────────────────────────────────────── */}
        {language === 'web' ? (
          <section ref={outputRef} className="pg-window pg-browser" data-lang="web" aria-labelledby="pg-output-title">
            <div className="pg-bar">
              <span className="pg-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <h2 id="pg-output-title" className="sr-only">
                {c.preview}
              </h2>
              <span className="pg-address">
                <Lock size={13} aria-hidden="true" />
                {FILE_NAME.html}
              </span>
              <button
                type="button"
                className="pg-icon-btn"
                onClick={() => renderPage(web.html, web.css)}
                aria-label={c.previewRefresh}
                title={c.previewRefresh}
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>
              {statusChip}
            </div>

            <HtmlPreview
              request={previewRequest}
              title={c.previewFrameTitle}
              empty={
                <>
                  <EmptyPage />
                  <p>{c.previewEmpty}</p>
                </>
              }
              onLine={(line) =>
                setWebLines((lines) => (lines.length >= WEB_LINE_LIMIT ? lines : [...lines, line]))
              }
              onRendered={() => setWebStatus('done')}
              onHung={() => setWebStatus('hung')}
            />

            {webStatus === 'hung' ? (
              <p className="pg-notice pg-notice--hung">
                <TriangleAlert size={14} aria-hidden="true" />
                {c.previewHung}
              </p>
            ) : pageHasScript && live ? (
              <p className="pg-notice">
                <Info size={14} aria-hidden="true" />
                {c.previewScriptNote}
              </p>
            ) : null}

            <label className="pg-live">
              <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} />
              {c.previewLive}
            </label>

            {/* The page's own console. `aria-live` for the same reason as the
                terminal's: output changes without focus moving. */}
            <div aria-live="polite" className="pg-mini-console">
              {webLines.length > 0 ? (
                <>
                  <p className="pg-mini-console__head">{c.console}</p>
                  {webLines.map((line, index) => (
                    <WebLine key={index} line={line} />
                  ))}
                </>
              ) : null}
            </div>
          </section>
        ) : (
          <section ref={outputRef} className="pg-window pg-term" aria-labelledby="pg-output-title">
            <div className="pg-bar">
              <span className="pg-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <h2 id="pg-output-title" className="pg-out__title">
                <SquareTerminal size={16} aria-hidden="true" />
                {c.output}
              </h2>
              {statusChip}
            </div>

            {/*
              `aria-live="polite"`: pressing Run changes this region without
              moving focus, so a screen-reader user would otherwise get no
              indication that anything happened. Polite rather than assertive —
              a student re-running a loop should not be shouted at every press.
            */}
            <div aria-live="polite" dir="ltr" className="pg-term__body">
              {result === null ? (
                running ? null : (
                  <div dir="rtl" className="pg-empty">
                    <EmptyTerminal />
                    <p>{c.outputEmpty}</p>
                  </div>
                )
              ) : (
                <>
                  {result.out.map((line, index) => (
                    // Output lines have no id and are never reordered — the
                    // index is a stable key in the one case where it is.
                    <div key={index} dir="auto" className="pg-line">
                      {line}
                    </div>
                  ))}
                  {result.error ? (
                    <div dir="auto" className="pg-line pg-line--err">
                      {result.error}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {/* ── Gallery ────────────────────────────────────────────────────── */}
      <section className="pg-gallery" aria-labelledby="pg-gallery-title">
        <div className="pg-gallery__head">
          <div>
            <p className="eyebrow mb-2 text-fg-muted">{c.galleryEyebrow}</p>
            <h2 id="pg-gallery-title" className="pg-gallery__title">
              <span className="pg-gallery__title-icon" aria-hidden="true">
                <Library size={20} />
              </span>
              {c.galleryTitle}
            </h2>
            <p className="pg-gallery__lead">{c.galleryLead}</p>
          </div>

          <div role="group" aria-label={c.galleryFilterLabel} className="pg-filters">
            {LANGUAGES.map((option) => (
              <button
                key={option}
                type="button"
                data-lang={option}
                className="pg-filter"
                aria-pressed={filter === option}
                aria-label={c.galleryFilterAria.replace('{lang}', LANGUAGE_NAME[option])}
                onClick={() => setFilter(option)}
              >
                <LanguageBadge language={option} />
                <span className="pg-filter__name">{LANGUAGE_NAME[option]}</span>
                <span className="pg-filter__count tabular">{EXAMPLES_BY_LANGUAGE[option].length}</span>
              </button>
            ))}
          </div>
        </div>

        <ul className="pg-cards">
          {EXAMPLES_BY_LANGUAGE[filter].map((example) => {
            const Icon = ICONS[example.icon];
            const active = example.language === language && example.id === currentExampleId;
            return (
              <li key={example.id} className="pg-card" data-hue={example.hue} data-active={active}>
                <div className="pg-card__art" aria-hidden="true">
                  <span className="pg-card__icon">
                    <Icon size={24} />
                  </span>
                  <span className="pg-card__lines">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <div className="pg-card__body" data-lang={example.language}>
                  <p className="pg-card__meta">
                    <LanguageBadge language={example.language} />
                    <span className="pg-card__meta-name">{LANGUAGE_NAME[example.language]}</span>
                    {active ? <span className="pg-card__here">{c.inEditor}</span> : null}
                  </p>
                  <h3 className="pg-card__title">{example.title}</h3>
                  <p className="pg-card__blurb">{example.blurb}</p>
                </div>
                <div className="pg-card__foot">
                  <button
                    type="button"
                    className="pg-try"
                    aria-label={c.tryExampleAria.replace('{title}', example.title)}
                    onClick={() => tryFromGallery(example)}
                  >
                    <Play size={15} aria-hidden="true" />
                    {c.tryExample}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** One line of the page's console. Always TEXT — it is the page's to write. */
function WebLine({ line }: { line: PreviewLine }) {
  if (line.level === 'link') {
    return (
      <div dir="auto" className="pg-line pg-line--note">
        {c.previewLinkBlocked.replace('{href}', line.text)}
      </div>
    );
  }
  const tone =
    line.level === 'error'
      ? ' pg-line--err'
      : line.level === 'warn' || line.level === 'alert'
        ? ' pg-line--warn'
        : '';
  return (
    <div dir="auto" className={`pg-line${tone}`}>
      {line.level === 'alert' ? `🔔 ${line.text}` : line.text}
    </div>
  );
}

/** A terminal window with a blinking prompt — the console's empty state. */
function EmptyTerminal() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden="true" focusable="false">
      <rect className="pg-empty__frame" x="1" y="1" width="118" height="78" rx="8" />
      <path className="pg-empty__prompt" d="M14 24l7 6-7 6" strokeWidth="3" />
      <rect className="pg-empty__cursor" x="26" y="33" width="10" height="3" rx="1.5" />
      <rect className="pg-empty__line" x="14" y="48" width="56" height="4" rx="2" />
      <rect className="pg-empty__line" x="14" y="58" width="36" height="4" rx="2" />
    </svg>
  );
}

/** A browser window with a small page in it — the preview's empty state. */
function EmptyPage() {
  return (
    <svg viewBox="0 0 136 96" aria-hidden="true" focusable="false">
      <rect className="pg-stage__empty-frame" x="1" y="1" width="134" height="94" rx="8" strokeWidth="2" />
      <path className="pg-stage__empty-bar" d="M2 9a7 7 0 0 1 7-7h118a7 7 0 0 1 7 7v7H2z" />
      <rect className="pg-stage__empty-hero" x="12" y="26" width="112" height="26" rx="5" />
      <rect className="pg-stage__empty-tile" x="12" y="60" width="34" height="24" rx="4" />
      <rect className="pg-stage__empty-tile pg-stage__empty-tile--b" x="51" y="60" width="34" height="24" rx="4" />
      <rect className="pg-stage__empty-tile pg-stage__empty-tile--c" x="90" y="60" width="34" height="24" rx="4" />
    </svg>
  );
}
