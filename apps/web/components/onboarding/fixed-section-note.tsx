import { GraduationCap } from 'lucide-react';
import { copy } from '@ayman/contracts';

const c = copy.onboarding;

/**
 * «إحنا عارفين الباقي» — the three answers that used to be three dropdowns.
 *
 * This platform is البكالوريا المصرية, مسار الهندسة وعلوم الحاسب, مادة
 * البرمجة وعلوم الحاسب, and nothing else. Asking a student to pick each of
 * those from a list with one right answer was three chances to get it wrong
 * and a cascade of hide/clear rules to keep them consistent; the year is the
 * only one of the four that actually varies between students.
 *
 * They are STATED rather than simply deleted because a step that asks a single
 * question and shows nothing else reads as half-loaded — and because a student
 * arriving from a school that talks about tracks needs to see that theirs is
 * accounted for, not missing.
 *
 * The values are copy, not taxonomy lookups: this describes the PLATFORM, not
 * the student's row. A year-1 student has no track at all (year 1 is common)
 * and still studies the same subject from the same teacher, so reading these
 * off their profile would print an empty half for them.
 */
export function FixedSectionNote() {
  const facts = [
    { label: c.system, value: c.fixedSystem },
    { label: c.track, value: c.fixedTrack },
    { label: c.subject, value: c.fixedSubject },
  ];

  return (
    <section className="rounded-lg border border-study-line bg-study-tint p-4">
      <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)] font-medium text-fg">
        <GraduationCap aria-hidden className="size-4 text-accent-text" />
        {c.fixedSectionTitle}
      </p>

      <dl className="mt-3 space-y-1.5">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-[length:var(--fs-text-sm)] text-fg-muted">{fact.label}</dt>
            <dd className="text-[length:var(--fs-text-sm)] font-medium text-fg">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[length:var(--fs-text-sm)] text-fg-muted">{c.fixedSectionHint}</p>
    </section>
  );
}
