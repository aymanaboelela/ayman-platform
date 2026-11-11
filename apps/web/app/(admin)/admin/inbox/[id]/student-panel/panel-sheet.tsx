'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { BarChart3, BookOpenCheck, ClipboardCheck, IdCard, Loader2 } from 'lucide-react';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { Sheet, SheetContent, SheetTitle } from '@ayman/ui/components/sheet';
import { cn } from '@ayman/ui/lib/cn';
import { PANEL_TABS, type PanelTab } from './panel-tabs';

/**
 * The drawer's frame: open while `?panel=` is on the URL, and closing it
 * drops the param.
 *
 * `open` is local and starts `true` because the server only renders this
 * while the param is present. Closing flips it at once — the panel goes the
 * moment he presses ✕, not after the round trip that re-renders the page
 * without it — and the replace then unmounts this component altogether, so
 * the next ⋮ press mounts a fresh one that starts open again.
 *
 * `replace`, not `push`: closing is not a place to go back to.
 *
 * Anchored to the inline END (the left in RTL) rather than the primitive's
 * start: the ⋮ that opens it sits at the header's end, and the admin rail
 * already owns the start edge.
 */
export function StudentPanelSheet({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        setOpen(false);
        router.replace(pathname, { scroll: false });
      }}
    >
      <SheetContent
        closeLabel={c.close}
        aria-describedby={undefined}
        /* Focus goes to the panel itself, not to Radix's first tabbable —
           which on the exams tab is the first «محاولة جديدة», ringed as if
           it were about to be pressed. */
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        className={cn(
          'student-panel start-auto end-0 w-[min(100vw,56rem)] gap-0 border-e-0 border-s p-0 outline-none',
          'bg-surface-1',
        )}
      >
        <SheetTitle className="sr-only">{c.title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}

const TAB_ICON: Record<PanelTab, typeof IdCard> = {
  overview: IdCard,
  courses: BookOpenCheck,
  exams: ClipboardCheck,
  analysis: BarChart3,
};

/**
 * The tab strip. Links, not buttons — each tab is its own server render — and
 * `replace`, so a dozen tab presses do not become a dozen back presses.
 *
 * A search-param navigation shows no `loading.tsx` (the page keeps its state
 * key, which is the point), so without `TabPending` a slow tab would look
 * like a press that did nothing.
 */
export function PanelTabs({ active }: { active: PanelTab }) {
  const pathname = usePathname();
  return (
    /* `shrink-0`: the sheet is a fixed-height flex COLUMN, and a child with
       `overflow-x-auto` has a zero min-height — without it the strip was
       squeezed to a 1px line under the hero. */
    <nav
      aria-label={c.title}
      className="sticky top-0 z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface-1/95 px-3 backdrop-blur md:px-5"
    >
      {PANEL_TABS.map((tab) => {
        const Icon = TAB_ICON[tab];
        const current = tab === active;
        return (
          <Link
            key={tab}
            href={`${pathname}?panel=${tab}`}
            replace
            scroll={false}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'relative inline-flex min-h-12 shrink-0 items-center gap-2 px-3 text-[length:var(--fs-text-sm)] font-medium',
              'transition-colors duration-[160ms] ease-out',
              current ? 'text-accent-text' : 'text-fg-muted hover:text-fg',
              // The underline — a bar on the bottom edge, accent on the
              // current tab only.
              'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full',
              current ? 'after:bg-accent' : 'after:bg-transparent',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {c.tabs[tab]}
            <TabPending />
          </Link>
        );
      })}
    </nav>
  );
}

function TabPending() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null;
}
