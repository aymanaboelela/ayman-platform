import { Users } from 'lucide-react';
import { copy } from '@ayman/contracts';

const c = copy.player.group;

/**
 * «جروب الدفعة» — the WhatsApp group for THIS course's students, in the
 * sidebar column beside the lesson they are watching.
 *
 * ## Three WhatsApp entry points on this platform, and they are not the same
 *
 * `WhatsappChannelCard` (dashboard) is the one broadcast CHANNEL, which nobody
 * can reply into. `CourseHelpCard` (below this one) is a DM to him about this
 * course. This is the COHORT — the people sitting the same lectures — and it
 * is the only one of the three that is per-course: «كل كورس بيبقى ليه جروب غير
 * الجروب الأساسي الكبير الرسمي».
 *
 * ## It disappears rather than falling back
 *
 * `whatsappGroupUrl` is `null` for most courses and that is the intended
 * steady state — «أوقات برضه ممكن أنا ما أعملش جروب أصلاً». Falling back to the
 * platform's official group would put every course's students in one room,
 * which is exactly the situation this field exists to end, and it is the same
 * shape of bug `WhatsappChannelCard`'s own note records from a card that once
 * fell back to a marketing page.
 *
 * ## Green, from the palette rather than from WhatsApp
 *
 * The glyph is `--ok`, the platform's own green, and not `#25D366`. A raw brand
 * hex is one value for two themes — it reads as a sticker on the dark one — and
 * `css-token-coverage.test.ts` exists precisely to stop colours entering this
 * codebase outside the token set. `--ok` is already tuned for both themes and
 * carries the same "this is the friendly one" reading, which is all the colour
 * is doing here: saying where the button goes before the sentence is read.
 */
export function CourseGroupCard({
  url,
  courseTitle,
}: {
  url: string | null;
  /**
   * Which course's cohort this is.
   *
   * Omitted in the PLAYER and on the library page: there the surrounding screen
   * is already about one course, and repeating its name inside the card is
   * noise. Passed on the DASHBOARD, where a student enrolled in عربي and لغات
   * would otherwise get two identical «جروب الدفعة» buttons with nothing to say
   * which room each one opens.
   */
  courseTitle?: string;
}) {
  if (!url) return null;

  return (
    <section aria-label={c.title} className="rounded-lg border border-line bg-surface-2 p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-[color-mix(in_oklch,var(--ok),transparent_86%)] text-[color:var(--ok)]"
        >
          <Users className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--fs-text-base)] font-semibold text-fg">{c.title}</p>
          <p className="mt-0.5 truncate text-[length:var(--fs-text-sm)] text-fg-muted">
            {courseTitle ?? c.lead}
          </p>
        </div>
      </div>

      {/*
        `noopener noreferrer` for the same reason every outbound link here
        carries it — and `target="_blank"` because a student mid-lecture must
        not lose the player to open a chat.
      */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="chip chip--solid mt-3.5 w-full"
      >
        {c.cta}
      </a>
    </section>
  );
}
