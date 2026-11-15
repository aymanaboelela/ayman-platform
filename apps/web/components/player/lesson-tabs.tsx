'use client';

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@ayman/ui/lib/cn';

export interface LessonTab {
  id: string;
  label: string;
  icon: ReactNode;
  /** A small count beside the label — «المرفقات ٣». Omitted when `undefined`. */
  count?: number;
  /** The count in red — a homework the student has not handed in yet. */
  alert?: boolean;
  content: ReactNode;
}

/**
 * One row of tabs under the lecture for everything it carries — الواجب ·
 * المرفقات · الملخص · ملاحظاتي · امتحان المحاضرة.
 *
 * These were five sections stacked down the page: a quiz card, the materials
 * open with a PDF viewer inside, a summary disclosure, a notes form drawn even
 * with no notes, then the homework. On a phone that was two screens of
 * furniture before the homework, which is the one thing the student has to
 * DO. One row says what is here and how much; the student opens what they
 * came for.
 *
 * ## Every panel stays MOUNTED
 *
 * Hidden with the `hidden` attribute, not unmounted. The homework panel holds
 * pages the student staged but has not sent, the notes panel a draft they are
 * typing — unmounting on a tab switch would throw both away for a glance at
 * the slides. Nothing in a hidden panel fetches on its own (the PDF viewer
 * opens on press, the notes clock ticks only once a player is published).
 *
 * ## The order is the default
 *
 * The first tab given is the one open on arrival, so the caller puts the
 * most urgent thing first — the homework when there is one, else the
 * materials the instructor uploaded to be read.
 */
export function LessonTabs({ tabs, label }: { tabs: readonly LessonTab[]; label: string }) {
  const base = useId();
  const [picked, setPicked] = useState<string | null>(null);
  if (tabs.length === 0) return null;

  const current = tabs.some((tab) => tab.id === picked) ? (picked as string) : tabs[0]!.id;
  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = (id: string) => `${base}-panel-${id}`;

  /*
   * Arrow keys move between tabs, as the APG tabs pattern asks; the tablist
   * is one tab stop (`tabIndex -1` on the rest). Under RTL the row runs
   * right-to-left, so ArrowLeft is "forward" — the key moves the focus the
   * way the eye reads it.
   */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === current);
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowRight') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next]!;
    setPicked(target.id);
    document.getElementById(tabId(target.id))?.focus();
  }

  return (
    <div className="lp-tabbed">
      <div role="tablist" aria-label={label} className="lp-tabs" onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === current;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              className="lp-tab"
              onClick={() => setPicked(tab.id)}
            >
              <span className="lp-tab__icon" aria-hidden="true">
                {tab.icon}
              </span>
              {tab.label}
              {tab.count !== undefined ? (
                <span className={cn('lp-tab__count', tab.alert && 'lp-tab__count--alert')}>{tab.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelId(tab.id)}
          aria-labelledby={tabId(tab.id)}
          hidden={tab.id !== current}
          className="lp-panel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
