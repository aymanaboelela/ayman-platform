/**
 * The drawer's tabs, and the one place the `?panel=` value is read.
 *
 * The drawer is URL state on purpose: the thread page renders it on the
 * SERVER, each tab fetching only its own data, and a search-param change keeps
 * the page's client state (the composer's draft, the scroll position) — the
 * App Router gives two segments that differ only by search params the same
 * state key. A client-fetched drawer would have needed its own copy of every
 * read the student page already does, and its own refresh after every write.
 */
export const PANEL_TABS = ['overview', 'courses', 'exams', 'analysis'] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

/** `null` = the drawer is closed. An unknown value opens it on the first tab
 *  rather than ignoring the press that produced it. */
export function parsePanelTab(raw: string | string[] | undefined): PanelTab | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return null;
  return (PANEL_TABS as readonly string[]).includes(value) ? (value as PanelTab) : 'overview';
}
