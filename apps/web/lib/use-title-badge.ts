'use client';

import { useEffect } from 'react';

const PREFIX = /^\(\d+\)\s/;

/**
 * «(٣) رسايل جديدة» in the tab's title — how a messenger says «something is
 * waiting» to a tab that is not in front. `0` or `null` shows nothing.
 *
 * Next rewrites `<title>` on every navigation, so the prefix is re-applied
 * whenever the title changes underneath it (a MutationObserver on `<head>`),
 * and stripped again on unmount.
 *
 * ⚠️ Nothing at all for `0`/`null` — no observer either. Two of these on one
 * page (the inbox badge and the student widget's) would otherwise fight: one
 * stripping the prefix, the other's observer putting it back, forever.
 */
export function useTitleBadge(count: number | null): void {
  useEffect(() => {
    if (!count || count <= 0) return;
    const apply = () => {
      const bare = document.title.replace(PREFIX, '');
      const next = `(${count}) ${bare}`;
      if (document.title !== next) document.title = next;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = document.title.replace(PREFIX, '');
    };
  }, [count]);
}
