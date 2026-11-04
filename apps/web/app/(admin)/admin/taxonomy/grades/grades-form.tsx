'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { GRADES, type GradeSlug } from '@ayman/contracts/grades';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { updateGradesAction } from '../actions';

const c = copy.admin.taxonomy;

/** The three stages, in the order a student moves through them. */
const STAGES = [
  { system: 'preparatory', label: c.gradesStagePrep },
  { system: 'thanaweya_amma', label: c.gradesStageSec },
  { system: 'bacalorya', label: c.gradesStageBac },
] as const;

/**
 * One checkbox per grade, grouped by stage. A plain list of ticks rather than
 * a multi-select: nine options is a list a teacher reads at a glance, and
 * «بكالوريا ٣» sitting unticked under «بكالوريا ١ و٢» says what it means.
 */
export function GradesForm({ current }: { current: readonly string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(current));
  const [pending, startTransition] = useTransition();

  const toggle = (slug: GradeSlug, on: boolean) =>
    setPicked((was) => {
      const next = new Set(was);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });

  const save = () =>
    startTransition(async () => {
      // Canonical order (`GRADES`), whatever order they were ticked in.
      const result = await updateGradesAction(GRADES.filter((g) => picked.has(g.slug)).map((g) => g.slug));
      if (result.ok) {
        toast.success(c.gradesSaved);
        router.refresh();
      } else {
        toast.error(c.gradesFailed);
      }
    });

  return (
    <div className="flex max-w-[var(--w-prose)] flex-col gap-6">
      {STAGES.map((stage) => (
        <fieldset key={stage.system} className="rounded-lg border border-line bg-surface p-4">
          <legend className="px-1 font-semibold text-fg">{stage.label}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {GRADES.filter((grade) => grade.system === stage.system).map((grade) => (
              <label
                key={grade.slug}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-line px-3 py-2.5 hover:bg-surface-2"
              >
                <Checkbox
                  checked={picked.has(grade.slug)}
                  onCheckedChange={(value) => toggle(grade.slug, value === true)}
                />
                <span className="text-[length:var(--fs-text-sm)] text-fg">{grade.labelAr}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
        {picked.size === 0 ? c.gradesNone : c.gradesNote}
      </p>

      <div>
        <Button type="button" onClick={save} disabled={pending}>
          {c.gradesSave}
        </Button>
      </div>
    </div>
  );
}
