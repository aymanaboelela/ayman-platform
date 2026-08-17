'use client';

import type { HeartbeatResponse } from '@ayman/contracts/progress';
import { SafeHtml } from '@/components/content/safe-html';
import { useDwellComplete } from './use-dwell-complete';

export interface TextLessonProps {
  lessonId: string;
  /**
   * ⚠️ Already sanitized, twice: `sanitize-html` on write in apps/api, and
   * `sanitizeRichText` again on the server in
   * `(app)/courses/[slug]/lessons/[lessonId]/page.tsx`. This component renders
   * it and does not re-check — it cannot, being a client component, which is
   * the whole reason the second pass moved to the page. See
   * `lib/sanitize-html.ts`.
   */
  bodyHtml: string;
  alreadyComplete: boolean;
  onProgress: (response: HeartbeatResponse) => void;
}

export function TextLesson({ lessonId, bodyHtml, alreadyComplete, onProgress }: TextLessonProps) {
  useDwellComplete({ lessonId, enabled: !alreadyComplete, onResponse: onProgress });

  return (
    // `bodyHtml` was produced by sanitize-html on write with a tight allowlist
    // and every <iframe> denied, then run through the SAME second DOMPurify
    // pass the public course description gets — one sanitizer, one allowlist,
    // no second one to drift. That pass now happens on the page rather than
    // here: this file is `'use client'`, so keeping it inline shipped
    // `dompurify` to the phone on the route a student sits on longest.
    <SafeHtml
      html={bodyHtml}
      className="max-w-[var(--w-prose)] space-y-4 text-fg [&_h2]:text-[length:var(--fs-title-3)] [&_h2]:font-semibold [&_h3]:text-[length:var(--fs-title-4)] [&_h3]:font-medium [&_p]:text-fg-muted [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5"
    />
  );
}
