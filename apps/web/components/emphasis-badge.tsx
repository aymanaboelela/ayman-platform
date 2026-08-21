import { copy } from '@ayman/contracts/copy';
import type { CourseEmphasis } from '@ayman/contracts/content';

const c = copy.emphasis;

/**
 * «مهم» / «موصى به» / «اختياري» on a course card, with the instructor's own
 * line under it saying who it applies to.
 *
 * ## It is a label, never a lock
 *
 * Nothing about this changes what a student can open — see `CourseEmphasis` in
 * schema.prisma. It exists because the catalog deliberately does NOT filter by
 * the student's year: a تأسيسي course is useful to more than one year, so the
 * grid shows every course to everyone and this is how the teacher says which
 * one to start with. A filter would have to be right about a student whose
 * `year` is null — most of them, early on — and would lock the rest out to be
 * so. A sentence is correct for all of them.
 *
 * ## Why the note is not a `title` tooltip
 *
 * Because it is the half that carries the meaning. «اختياري» alone reads as
 * "skip this"; «اختياري · لو خلصت تانية بكالوريا» reads as an instruction. A
 * tooltip is not reachable on the touch devices most of these students use,
 * and `title` is not announced by every screen reader — so it renders as text.
 *
 * ## Colour
 *
 * Same restraint as `StreamBadge`: never `--a-*`, which is the ACTION colour
 * in this system and would make a passive label look pressable. Required
 * borrows the ember ink that already means "this one", recommended sits on the
 * plain surface, and optional is deliberately the quietest of the three.
 */
export function EmphasisBadge({
  emphasis,
  note,
  className,
}: {
  emphasis: CourseEmphasis | null;
  note: string | null;
  className?: string;
}) {
  // No badge is the default and most courses — a grid where every card shouts
  // has no emphasis left to give. The CHECK behind `emphasis_note` means a
  // note cannot arrive without one, so there is no orphan-note state to render.
  if (emphasis === null) return null;

  return (
    <span className={className ? `emphasis ${className}` : 'emphasis'}>
      <span className={`emphasis__chip emphasis__chip--${emphasis}`}>{c[emphasis]}</span>
      {note ? <span className="emphasis__note">{note}</span> : null}
    </span>
  );
}
