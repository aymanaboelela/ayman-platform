import type { LucideIcon } from 'lucide-react';

/**
 * A short note that belongs to ONE field, drawn as an object rather than as a
 * paragraph.
 *
 * ## Why this is not just a `<p>`
 *
 * It was. «الرقم ده عشان نقدر نتواصل مع ولي أمرك…» sat above the guardian's
 * phone as muted grey body text, and the person who asked for that sentence in
 * the first place read the finished step and asked for it again — which is the
 * only review a disclosure ever really gets. Grey prose between a step title
 * and an input is the shape of page furniture, and page furniture is what
 * everyone has learned to skip.
 *
 * So: the study tint, a hairline, and an icon. The same three moves `.empty`
 * makes for an empty state, for the same reason — a thing with edges reads as
 * content, and a wall of unbroken text reads as terms nobody has to accept.
 *
 * ## `id`, and why it is required
 *
 * The note explains the field, so the field has to SAY it explains it:
 * `aria-describedby={id}` on the input is the caller's half of this, and
 * without it the sentence is invisible to anyone who reaches the input by
 * keyboard or hears it read out. That is most of the reason to attach a note
 * to a field rather than to a step.
 */
export function FieldNote({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      className="flex items-start gap-2.5 rounded-md border border-study-line bg-study-tint p-3 text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted"
    >
      {/* `mt-0.5` optically centres a 16px glyph against the first line of
          Arabic body text, which sits low in its box. `shrink-0` because the
          sentence wraps and the icon must not. */}
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-text" />
      <span>{children}</span>
    </p>
  );
}
