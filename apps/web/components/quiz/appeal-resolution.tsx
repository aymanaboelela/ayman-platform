import { copy } from '@ayman/contracts';

export interface AppealResolutionProps {
  gradeBefore: number;
  gradeAfter: number | null;
  resolverNote: string | null;
}

/**
 * "الدرجة قبل التظلم / بعد التظلم" — the trust signal parents notice. Shown
 * once an appeal is resolved (accepted OR rejected — a rejection is still
 * worth stating plainly, `gradeAfter` just stays absent).
 */
export function AppealResolution({ gradeBefore, gradeAfter, resolverNote }: AppealResolutionProps) {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-line-subtle bg-surface-2 p-3">
      <div className="flex items-center gap-4">
        <p className="text-[length:var(--fs-text-sm)] text-fg">
          <span className="text-fg-muted">{copy.appeal.gradeBefore}: </span>
          <span className="mono tabular-nums">{gradeBefore}</span>
        </p>
        {gradeAfter !== null ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg">
            <span className="text-fg-muted">{copy.appeal.gradeAfter}: </span>
            <span className="mono tabular-nums">{gradeAfter}</span>
          </p>
        ) : null}
      </div>
      {resolverNote ? (
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {copy.appeal.resolverNote}: {resolverNote}
        </p>
      ) : null}
    </div>
  );
}
