import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.admin.inboxTabs;

export const INBOX_TABS = [
  { href: '/admin/inbox', label: c.tabConversations },
  { href: '/admin/inbox/questions', label: c.tabQuestions },
] as const;

export type InboxTabHref = (typeof INBOX_TABS)[number]['href'];

/**
 * «صندوق الوارد» — the two halves of one subject.
 *
 * ## Why «أسئلة الطلبة» stopped being its own nav entry
 *
 * Asked for directly: «دي أنا مش عايزها هنا، دي أنا عايزها في اللي هو صندوق
 * الوارد». The two screens were never two subjects — they are the same
 * students asking the same things, split only by WHO answered: a person, or
 * المساعد. Reading them as two unrelated nav destinations meant the question
 * a student asked the machine at 1am and the message they sent him at 2am
 * lived a sidebar apart, and nothing on either screen said the other existed.
 *
 * A tab, not a merged list: the two have genuinely different shapes — a
 * conversation is an open thread with an unread state, a question is a closed
 * exchange that already has its answer — and interleaving them by timestamp
 * would make the inbox's unread count mean two things.
 *
 * A Server Component, same as `FinanceTabs` and `BooksTabs`: the caller knows
 * which tab it is, and shipping `usePathname` for a border colour would be the
 * whole client runtime for a highlight.
 */
export function InboxTabs({ active }: { active: InboxTabHref }) {
  return (
    <nav className="mt-4 flex flex-wrap gap-1.5" aria-label={c.ariaLabel}>
      {INBOX_TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === active ? 'page' : undefined}
          className={cn(
            'rounded-full border px-4 py-1.5 text-[length:var(--fs-text-sm)] font-medium',
            'transition-colors duration-[160ms] ease-out',
            tab.href === active
              ? 'border-accent bg-accent text-[#1A1206]'
              : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
