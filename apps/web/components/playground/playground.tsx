'use client';

import { useRef, useState } from 'react';
import { Check, Copy, Download, Play, RotateCcw } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { runCode, type RunResult } from '@/lib/run-code';
import { isPythonBooted, resetPython, runPython } from '@/lib/run-python';

const c = copy.playground;

/**
 * Snippets a student can start from, in the order they build on each other.
 *
 * Arabic labels, English code. That split is not a compromise — a variable
 * named `اسم` is legal JavaScript and reads as a joke, and every reference the
 * student will ever look up is in English. The COMMENTS are Arabic, which is
 * where the explaining actually happens.
 */
const JS_EXAMPLES = [
  {
    label: 'أول برنامج',
    code: `// اطبع أي حاجة على الشاشة\nconsole.log("أهلاً يا برمجة!");\n\nconst name = "أحمد";\nconsole.log("إزيك يا " + name);`,
  },
  {
    label: 'شرط',
    code: `const grade = 78;\n\nif (grade >= 85) {\n  console.log("ممتاز");\n} else if (grade >= 65) {\n  console.log("جيد جدًا");\n} else {\n  console.log("محتاج مذاكرة");\n}`,
  },
  {
    label: 'حلقة',
    code: `// جدول الضرب بتاع ٧\nfor (let i = 1; i <= 10; i++) {\n  console.log(7 + " x " + i + " = " + 7 * i);\n}`,
  },
  {
    label: 'دالة',
    code: `function average(numbers) {\n  let total = 0;\n  for (const n of numbers) total += n;\n  return total / numbers.length;\n}\n\nconsole.log(average([80, 92, 67, 75]));`,
  },
  {
    label: 'مصفوفة',
    code: `const marks = [80, 92, 67, 75, 88];\n\nconsole.log("العدد:", marks.length);\nconsole.log("الأعلى:", Math.max(...marks));\nconsole.log("الناجحين:", marks.filter((m) => m >= 75));`,
  },
] as const;

/**
 * The same five ideas in Python, not a translation of the JavaScript.
 *
 * A student switching languages is comparing HOW each one says a thing, so the
 * programs have to be idiomatic in both — `for i in range(1, 11)` rather than a
 * transliterated C-style loop, and an f-string rather than `+` concatenation.
 * Matching them line for line would teach the wrong lesson twice.
 */
const PY_EXAMPLES = [
  {
    label: 'أول برنامج',
    code: `# اطبع أي حاجة على الشاشة\nprint("أهلاً يا برمجة!")\n\nname = "أحمد"\nprint(f"إزيك يا {name}")`,
  },
  {
    label: 'شرط',
    code: `grade = 78\n\nif grade >= 85:\n    print("ممتاز")\nelif grade >= 65:\n    print("جيد جدًا")\nelse:\n    print("محتاج مذاكرة")`,
  },
  {
    label: 'حلقة',
    code: `# جدول الضرب بتاع ٧\nfor i in range(1, 11):\n    print(f"7 x {i} = {7 * i}")`,
  },
  {
    label: 'دالة',
    code: `def average(numbers):\n    return sum(numbers) / len(numbers)\n\nprint(average([80, 92, 67, 75]))`,
  },
  {
    label: 'قائمة',
    code: `marks = [80, 92, 67, 75, 88]\n\nprint("العدد:", len(marks))\nprint("الأعلى:", max(marks))\nprint("الناجحين:", [m for m in marks if m >= 75])`,
  },
] as const;

type Language = 'js' | 'python';

const EXAMPLES_BY_LANGUAGE: Record<Language, readonly { label: string; code: string }[]> = {
  js: JS_EXAMPLES,
  python: PY_EXAMPLES,
};

/**
 * The scratchpad: a textarea, a run button, and whatever the code printed.
 *
 * ## It reuses the landing lab's evaluator, and that is the point
 *
 * `lib/run-code.ts` is the part with actual security relevance — a throwaway
 * Web Worker with no DOM, no app state, its three network entry points deleted
 * before any user code compiles, and a 2500ms kill switch. A second evaluator
 * here would be a second thing to get wrong. Only the shell differs: that one
 * sells the idea to a visitor, this one is a tool for someone already inside.
 *
 * ## Why a plain textarea and not a code editor
 *
 * CodeMirror and Monaco are 200kB+ of JavaScript for syntax colouring on a
 * page whose whole job is "type six lines and press run". A `<textarea>` with
 * the mono face, `dir="ltr"`, `spellCheck={false}` and tab-to-indent covers
 * every one of those six lines, works on a phone keyboard, and is reachable by
 * a screen reader without an ARIA grid. If this grows into a real editor
 * later, that is a deliberate decision with a measured cost — not the default.
 */
export function Playground() {
  const [language, setLanguage] = useState<Language>('js');
  const [exampleIndex, setExampleIndex] = useState(0);
  const [code, setCode] = useState<string>(JS_EXAMPLES[0]!.code);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [pythonReady, setPythonReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const examples = EXAMPLES_BY_LANGUAGE[language];

  async function run() {
    setRunning(true);
    setResult(language === 'python' ? await runPython(code) : await runCode(code));
    if (language === 'python') setPythonReady(isPythonBooted());
    setRunning(false);
  }

  /**
   * Downloading 13.5 MB is a decision, so it is a button press and not a side
   * effect of choosing Python from a dropdown. A student on mobile data who
   * only wanted to LOOK at the Python examples never pays for the interpreter.
   *
   * Booting is the same call as running — `runPython('')` boots and executes
   * nothing — so there is no second code path that could boot differently from
   * the one every run goes through.
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

  function switchLanguage(next: Language) {
    setLanguage(next);
    setExampleIndex(0);
    setCode(EXAMPLES_BY_LANGUAGE[next][0]!.code);
    setResult(null);
  }

  function loadExample(index: number) {
    setExampleIndex(index);
    setCode(examples[index]!.code);
    setResult(null);
  }

  /** A clean interpreter, for when leftover variables are the problem. */
  function restartPython() {
    resetPython();
    setPythonReady(false);
    setResult(null);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied (insecure context, or the user declined). The button
      // simply does not confirm; there is nothing useful to say about it.
    }
  }

  /**
   * Tab indents instead of leaving the field.
   *
   * This traps a key that keyboard users rely on to escape, so Escape-then-Tab
   * still works: Escape blurs the textarea, restoring normal navigation. That
   * pairing is the accepted way to make a code field usable without making it
   * a keyboard trap.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.currentTarget.blur();
      return;
    }
    if (event.key !== 'Tab' || event.shiftKey) return;
    event.preventDefault();
    const el = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = `${code.slice(0, start)}  ${code.slice(end)}`;
    setCode(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  }

  const lineCount = code.split('\n').length;
  const needsPythonDownload = language === 'python' && !pythonReady;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel flex min-h-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-2">
          {/* Two languages, so two radio-like buttons rather than a <select>:
              the whole choice is visible without opening anything, and the
              current one is legible at a glance while reading code. */}
          <div role="group" aria-label={c.languageLabel} className="flex items-center gap-1">
            {(['js', 'python'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => switchLanguage(option)}
                aria-pressed={language === option}
                className={cn(
                  'mono h-7 rounded-sm px-2 text-[length:var(--fs-mono-label)]',
                  'transition-colors duration-[160ms] ease-out',
                  language === option
                    ? 'bg-accent text-[#1A1206]'
                    : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                )}
              >
                {option === 'js' ? c.js : c.python}
              </button>
            ))}
          </div>

          <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
            {c.lines.replace('{n}', String(lineCount))}
          </span>

          <label className="ms-auto">
            <span className="sr-only">{c.examplesLabel}</span>
            <select
              value={exampleIndex}
              onChange={(event) => loadExample(Number(event.target.value))}
              className="h-8 rounded-sm border border-line bg-surface-1 px-2 text-[length:var(--fs-text-sm)] text-fg"
            >
              {examples.map((example, index) => (
                <option value={index} key={example.label}>
                  {example.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* `dir="ltr"` is load-bearing, not cosmetic: the page's base direction
            is RTL, and code left to inherit it reorders brackets and operators
            into something that is not the program the student wrote. */}
        <textarea
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={onKeyDown}
          dir="ltr"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={c.editorLabel}
          className={cn(
            'mono min-h-[19rem] w-full flex-1 resize-y bg-transparent p-4',
            'text-[length:var(--fs-text-sm)] leading-relaxed text-fg',
            'outline-none focus-visible:bg-surface-2',
          )}
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          {/* Python that has not booted yet shows the DOWNLOAD instead of Run.
              One primary action at a time: a Run button that silently pulls
              13.5 MB before doing anything is the thing this avoids. */}
          {needsPythonDownload ? (
            <button
              type="button"
              onClick={() => void loadPython()}
              disabled={running}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-sm bg-accent px-4',
                'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
                'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
            >
              <Download size={15} aria-hidden="true" />
              {running ? c.pythonLoading : c.pythonLoad}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run()}
              disabled={running}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-sm bg-accent px-4',
                'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
                'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
            >
              <Play size={15} aria-hidden="true" />
              {running ? c.running : c.run}
            </button>
          )}

          <button
            type="button"
            onClick={() => loadExample(exampleIndex)}
            className="inline-flex h-10 items-center gap-2 rounded-sm border border-line px-3 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] ease-out hover:bg-surface-3"
          >
            <RotateCcw size={15} aria-hidden="true" className="icon-inline" />
            {c.reset}
          </button>

          <button
            type="button"
            onClick={() => void copyCode()}
            className="inline-flex h-10 items-center gap-2 rounded-sm border border-line px-3 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] ease-out hover:bg-surface-3"
          >
            {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copied ? c.copied : c.copy}
          </button>

          {/* Only once there is an interpreter to restart. A persistent worker
              keeps variables between runs (see `lib/run-python.ts`), which is
              what a notebook does and what a student trying things expects —
              this is the escape hatch when that is the problem. */}
          {language === 'python' && pythonReady ? (
            <button
              type="button"
              onClick={restartPython}
              className="ms-auto inline-flex h-10 items-center gap-2 rounded-sm px-3 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg"
            >
              <RotateCcw size={15} aria-hidden="true" className="icon-inline" />
              {c.resetRuntime}
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel flex min-h-0 flex-col overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-4 py-2">
          <h2 className="mono text-[length:var(--fs-mono-label)] text-fg-muted">{c.output}</h2>
        </div>

        {/*
          `aria-live="polite"`: pressing Run changes this region without moving
          focus, so a screen-reader user would otherwise get no indication that
          anything happened at all. Polite rather than assertive — the result is
          not an interruption, and a student re-running a loop would be shouted
          at on every press.
        */}
        <div
          aria-live="polite"
          dir="ltr"
          className="mono min-h-[19rem] flex-1 overflow-auto p-4 text-[length:var(--fs-text-sm)] leading-relaxed"
        >
          {result === null ? (
            <p dir="rtl" className="text-fg-muted">
              {c.outputEmpty}
            </p>
          ) : (
            <>
              {result.out.map((line, index) => (
                // Output lines have no id and are not reordered — the index is
                // a stable key here in the one case where it genuinely is.
                <div key={index} className="whitespace-pre-wrap break-words text-fg">
                  {line}
                </div>
              ))}
              {result.error ? (
                <div className="mt-2 whitespace-pre-wrap break-words text-[color:var(--err)]">
                  {result.error}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
