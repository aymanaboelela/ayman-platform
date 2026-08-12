'use client';

import { useRef, useState } from 'react';
import { Copy, Eraser, Play, RotateCcw } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { runCode, type RunResult } from '@/lib/run-code';

const c = copy.landing;

/** The starter snippets behind the toolbar's picker. */
const EXAMPLES: readonly { label: string; code: string }[] = [
  {
    label: c.playExampleStart,
    code: `console.log("أهلاً يا مبرمج 👋");

const name = "أيمن";
console.log(\`منصة المهندس \${name}\`);

const a = 7;
const b = 5;
console.log(\`المجموع = \${a + b}\`);`,
  },
  {
    label: c.playExampleVars,
    code: `let score = 0;
const bonus = 10;

score = score + bonus;
console.log("النتيجة:", score);

const student = { name: "سارة", year: 1 };
console.log(student);`,
  },
  {
    label: c.playExampleConditions,
    code: `const grade = 78;

if (grade >= 85) {
  console.log("ممتاز");
} else if (grade >= 65) {
  console.log("جيد جدًا");
} else {
  console.log("محتاج مراجعة");
}`,
  },
  {
    label: c.playExampleLoops,
    code: `for (let i = 1; i <= 5; i++) {
  console.log(\`تكرار رقم \${i}\`);
}

let n = 3;
while (n > 0) {
  console.log("العد التنازلي:", n);
  n--;
}`,
  },
  {
    label: c.playExampleFunctions,
    code: `function greet(name) {
  return \`أهلاً يا \${name}\`;
}

const double = (x) => x * 2;

console.log(greet("أحمد"));
console.log(double(21));`,
  },
  {
    label: c.playExampleArrays,
    code: `const marks = [88, 72, 95, 60];

console.log("عدد الدرجات:", marks.length);
console.log("أعلى درجة:", Math.max(...marks));

const passed = marks.filter((m) => m >= 65);
console.log("الناجحة:", passed);`,
  },
  {
    label: c.playExampleErrors,
    code: `// جرّب شغّل الكود ده وشوف رسالة الخطأ
const numbers = [1, 2, 3];

console.log(numbers.toUpperCase());`,
  },
];

/**
 * The interactive lab: a toolbar over a split editor/console.
 *
 * Execution lives in `lib/run-code` — this component only owns the shell, the
 * example picker and the keyboard shortcut, so the sandbox can be reviewed and
 * tested without a React tree around it.
 */
export function CodeLab() {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [code, setCode] = useState(EXAMPLES[0]!.code);
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

  const lineCount = code.split('\n').length;
  const errorCount = result?.error ? 1 : 0;

  return (
    <section className="site-section lab" id="interactive-ide">
      <div className="site-shell">
        <header className="lab__head">
          <span className="site-badge">{c.playEyebrow}</span>
          <h2 className="site-h2" style={{ marginTop: '1rem' }}>
            {c.playTitle}
          </h2>
          <p className="site-lead">{c.playLead}</p>
        </header>

        <div className="lab__frame">
          <div className="lab__toolbar">
            <span className="lab__file">{c.playFile}</span>
            <span className="lab__lang">{c.playLang}</span>

            <label className="lab__select-wrap">
              <span className="sr-only">{c.playExampleLabel}</span>
              <select
                className="lab__select"
                value={exampleIndex}
                onChange={(e) => loadExample(Number(e.target.value))}
              >
                {EXAMPLES.map((example, i) => (
                  <option value={i} key={example.label}>
                    {example.label}
                  </option>
                ))}
              </select>
            </label>

            <span className="lab__hint" aria-hidden="true">
              {c.playHint}
            </span>

            <div className="lab__actions">
              <button
                type="button"
                className="lab__btn lab__btn--run"
                onClick={() => void run()}
                disabled={running}
              >
                <Play size={15} aria-hidden="true" />
                {running ? c.playRunning : c.playRun}
              </button>
              <button type="button" className="lab__btn" onClick={() => loadExample(exampleIndex)}>
                <RotateCcw size={15} aria-hidden="true" />
                {c.playReset}
              </button>
              <button type="button" className="lab__btn" onClick={() => setResult(null)}>
                <Eraser size={15} aria-hidden="true" />
                {c.playClear}
              </button>
              <button type="button" className="lab__btn" onClick={() => void copyCode()}>
                <Copy size={15} aria-hidden="true" />
                {copied ? c.playCopied : c.playCopy}
              </button>
            </div>
          </div>

          {/* Editor first in the DOM so it takes the inline-start (right)
              column under `dir="rtl"`, matching every code editor the students
              already use — and so keyboard focus reaches the thing you type in
              before the thing that reports on it. */}
          <div className="lab__split">
            <div className="lab__editor">
              <div className="lab__editor-bar">
                <span>{c.playEditorLabel}</span>
              </div>
              <textarea
                className="lab__code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  // The shortcut the toolbar advertises. `metaKey` for macOS,
                  // `ctrlKey` elsewhere — checking both means a single binding.
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void run();
                  }
                }}
                spellCheck={false}
                dir="ltr"
                aria-label={c.playEditorAria}
              />
            </div>

            <div className="lab__console">
              <div className="lab__console-bar">
                <span>● {c.playConsole}</span>
              </div>

              {/*
                The run tally is kept but not shown. Sighted users read the
                result itself — printing "0 lines, 0 errors" beside it is chrome
                that adds nothing. A screen reader has no such luxury: without
                this, running the code produces no announcement at all, because
                the output pane below is a silent DOM mutation.

                `aria-live="polite"` waits for the user to stop typing before
                announcing, which is what makes it usable rather than chatty.
              */}
              <p className="sr-only" aria-live="polite">
                {running
                  ? c.playRunning
                  : `${c.playConsoleIdle} · ${result?.out.length ?? 0} ${c.playConsoleLines} · ${errorCount} ${c.playConsoleErrors} · ${lineCount} ${c.playConsoleLines}`}
              </p>

              <div className="lab__out">
                {!result ? (
                  <p className="lab__empty">{c.playEmpty}</p>
                ) : (
                  <>
                    {result.out.map((line, i) => (
                      <div className="lab__line" key={i}>
                        {line}
                      </div>
                    ))}
                    {result.error ? <div className="lab__err">⛔ {result.error}</div> : null}
                    {result.out.length === 0 && !result.error ? (
                      <p className="lab__empty">{c.playNoOutput}</p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
