import { MessageCircleQuestion } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { waMeHref } from '@ayman/contracts/whatsapp';

const c = copy.player.help;

/**
 * «تحتاج مساعدة؟» — the last-resort card at the bottom of the sidebar
 * column, under `CourseOutlineSidebar`'s own lesson list.
 *
 * ## Why the bottom, not the top
 *
 * Everything above it — the details card, the outline itself — is a student
 * finding their own way through the course. This is the exit for the one who
 * scrolled all of that and still has a question none of it answered, so it
 * comes last: the thing to reach for once self-service has run out, not a
 * button competing with «مشاهدة» for the first glance.
 *
 * ## `contact.whatsapp`, not `contact.whatsappChannel`
 *
 * Two different settings, same distinction `ContactSchema` documents:
 * `whatsappChannel` is a broadcast a student cannot reply into — the
 * dashboard's `WhatsappChannelCard` already owns that invite — while
 * `whatsapp` is the number a REAL question can reach, via `waMeHref`. Sending
 * "تحتاج مساعدة؟" to the channel would open a chat nobody reads.
 *
 * ## Renders nothing when unset
 *
 * `contact.whatsapp` starts `null`, same as `contact.whatsappChannel`.
 * `WhatsappChannelCard`'s own note records the bug that shipped once from a
 * card that fell back to a platform's marketing page instead of disappearing
 * — this follows the same rule rather than repeating it.
 */
export function CourseHelpCard({ whatsapp }: { whatsapp: string | null }) {
  const href = waMeHref(whatsapp);
  if (!href) return null;

  return (
    <section
      aria-label={c.title}
      className="rounded-lg border border-line bg-surface-2 p-4"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-[color:var(--e-tint)] text-[color:var(--e-ink)]"
        >
          <MessageCircleQuestion className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--fs-text-base)] font-semibold text-fg">{c.title}</p>
          <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>
        </div>
      </div>

      <a href={href} target="_blank" rel="noopener noreferrer" className="chip chip--solid mt-3.5 w-full">
        {c.cta}
      </a>
    </section>
  );
}
