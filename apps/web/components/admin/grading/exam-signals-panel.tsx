import { ClipboardPaste, Copy, Eye, LogOut, RotateCcw, ShieldCheck } from 'lucide-react';
import { examSignals as s } from '@ayman/contracts/copy/exam-signals';
import type { AdminExamSignal, AdminExamSignals, ExamSignalType } from '@ayman/contracts/quiz/exam-signals';
import { formatCopy } from '@ayman/contracts/format';

/**
 * Cairo time with the seconds, because the timeline is read in seconds («خرج
 * ورجع بعد ٤٠ ثانية»). An explicit zone rather than the server's, so the
 * screen says the same thing wherever the API container happens to run.
 */
const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Africa/Cairo',
});

/** «٤٥ ث» · «٣ د ٢٠ ث» · «١ س ٥ د», in Western digits. */
export function formatAway(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return formatCopy(s.hours, { h, m });
  if (m > 0) return formatCopy(s.minutes, { m, s: sec });
  return formatCopy(s.seconds, { s: sec });
}

/** The rows that are the reason to open the panel, in a warning tone. */
const LOUD: ReadonlySet<ExamSignalType> = new Set(['paste', 'copy', 'hidden', 'blur', 'pagehide', 'left']);

function SignalRow({ event }: { event: AdminExamSignal }) {
  const loud = LOUD.has(event.type);
  return (
    <li className="flex flex-col gap-1 border-b border-line py-2 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[length:var(--fs-text-sm)]">
        <span className="text-fg-muted tabular-nums [direction:ltr] [unicode-bidi:isolate]">
          {timeFormatter.format(new Date(event.at))}
        </span>
        <span className={loud ? 'font-semibold text-[color:var(--warn)]' : 'text-fg'}>{s.types[event.type]}</span>
        {event.questionNumber !== null && event.type !== 'opened' ? (
          <span className="text-fg-muted">{formatCopy(s.question, { n: event.questionNumber })}</span>
        ) : null}
        {event.chars !== null && event.chars > 0 ? (
          <span className="text-fg-muted tabular-nums">{formatCopy(s.chars, { n: event.chars })}</span>
        ) : null}
        {event.awayMs !== null ? (
          <span className="text-fg-muted tabular-nums">{formatCopy(s.after, { t: formatAway(event.awayMs) })}</span>
        ) : null}
      </div>
      {event.text ? (
        // `dir="auto"`: a pasted AI answer is as often English code as Arabic
        // prose, and either must read in its own direction.
        <blockquote
          dir="auto"
          aria-label={s.textLabel}
          className="whitespace-pre-wrap break-words rounded-[var(--r-sm)] border border-line bg-surface-1 px-3 py-2 font-mono text-[length:var(--fs-text-xs)] text-fg"
        >
          {event.text}
        </blockquote>
      ) : null}
    </li>
  );
}

/**
 * «متابعة الامتحان» on the marking screen — what the exam runner noticed on
 * this paper. Not rendered at all when it was not recording (`signals` null).
 *
 * A Server Component: the times are formatted here, once, so there is no
 * hydration pass to disagree with, and «كل التفاصيل» is a native `<details>`
 * with nothing to hydrate.
 */
export function ExamSignalsPanel({ signals }: { signals: AdminExamSignals }) {
  const clean = signals.pastes === 0 && signals.copies === 0 && signals.leaves === 0;

  if (clean) {
    return (
      <section
        aria-label={s.title}
        className="mt-4 flex items-center gap-2 rounded-[var(--r-lg)] border border-line bg-surface-2 px-4 py-3 text-[length:var(--fs-text-sm)] text-fg-muted"
      >
        <ShieldCheck className="size-4 shrink-0 text-ok" aria-hidden="true" />
        <span className="font-semibold text-fg">{s.title}</span>
        <span>{s.clean}</span>
      </section>
    );
  }

  const chips: Array<{ key: string; icon: React.ReactNode; label: string }> = [];
  if (signals.pastes > 0) {
    chips.push({ key: 'paste', icon: <ClipboardPaste className="size-4" aria-hidden="true" />, label: formatCopy(s.pastes, { n: signals.pastes }) });
  }
  if (signals.copies > 0) {
    chips.push({ key: 'copy', icon: <Copy className="size-4" aria-hidden="true" />, label: formatCopy(s.copies, { n: signals.copies }) });
  }
  if (signals.leaves > 0) {
    chips.push({ key: 'leave', icon: <LogOut className="size-4" aria-hidden="true" />, label: formatCopy(s.leaves, { n: signals.leaves }) });
  }
  if (signals.awayMs > 0) {
    chips.push({ key: 'away', icon: <Eye className="size-4" aria-hidden="true" />, label: formatCopy(s.away, { t: formatAway(signals.awayMs) }) });
  }
  if (signals.opens > 1) {
    chips.push({ key: 'opens', icon: <RotateCcw className="size-4" aria-hidden="true" />, label: formatCopy(s.opens, { n: signals.opens }) });
  }

  return (
    <section
      aria-label={s.title}
      className="mt-4 rounded-[var(--r-lg)] border border-[color-mix(in_oklab,var(--warn)_40%,var(--border))] bg-[color-mix(in_oklab,var(--warn)_6%,var(--n-2))] p-4 sm:p-5"
    >
      <h2 className="text-[length:var(--fs-text-base)] font-semibold text-fg">{s.title}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li
            key={chip.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--warn)_40%,var(--border))] bg-surface-1 px-3 py-1 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--warn)] tabular-nums"
          >
            {chip.icon}
            {chip.label}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[length:var(--fs-text-xs)] text-fg-muted">{s.lead}</p>

      <details className="mt-3">
        <summary className="cursor-pointer text-[length:var(--fs-text-sm)] font-semibold text-accent-text">
          {formatCopy(s.showAll, { n: signals.events.length })}
        </summary>
        <ol className="mt-2">
          {signals.events.map((event, index) => (
            <SignalRow key={index} event={event} />
          ))}
        </ol>
      </details>
    </section>
  );
}
