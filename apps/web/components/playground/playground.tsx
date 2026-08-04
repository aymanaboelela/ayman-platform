'use client';

import { useRef, useState } from 'react';
import { Check, Copy, Play, RotateCcw } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { runCode, type RunResult } from '@/lib/run-code';

const c = copy.playground;

/**
 * Snippets a student can start from, in the order they build on each other.
 *
 * Arabic labels, English code. That split is not a compromise — a variable
 * named `اسم` is legal JavaScript and reads as a joke, and every reference the
 * student will ever look up is in English. The COMMENTS are Arabic, which is
 * where the explaining actually happens.
 */
const EXAMPLES = [
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
  const [exampleIndex, setExampleIndex] = useState(0);
  const [code, setCode] = useState<string>(EXAMPLES[0]!.code);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function run() {
    setRunning(true);
    setResult(await runCode(code));
    setRunning(false);
  }

  function loadExample(index: number) {
    setExampleIndex(index);
    setCode(EXAMPLES[index]!.code);
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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel flex min-h-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-2">
          <span className="mono text-[length:var(--fs-mono-label)] text-accent-text">
            {c.language}
          </span>
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
              {EXAMPLES.map((example, index) => (
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
