/**
 * The box a tab becomes when its read is not available — forbidden to this
 * role, or failed. Dashed like the student page's own fallback panels, and it
 * always says something: an empty tab is indistinguishable from a bug.
 */
export function PanelNotice({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-6 text-center">
      <p className="text-fg-muted">{title}</p>
      {hint ? <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{hint}</p> : null}
    </div>
  );
}
