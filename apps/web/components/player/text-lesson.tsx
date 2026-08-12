'use client';

import type { HeartbeatResponse } from '@ayman/contracts/progress';
import { RichText } from '@/components/content/rich-text';
import { useDwellComplete } from './use-dwell-complete';

export interface TextLessonProps {
  lessonId: string;
  bodyHtml: string;
  alreadyComplete: boolean;
  onProgress: (response: HeartbeatResponse) => void;
}

export function TextLesson({ lessonId, bodyHtml, alreadyComplete, onProgress }: TextLessonProps) {
  useDwellComplete({ lessonId, enabled: !alreadyComplete, onResponse: onProgress });

  return (
    // `bodyHtml` was produced by sanitize-html on write with a tight
    // allowlist and every <iframe> denied. `RichText` (Plan 3) runs the same
    // second DOMPurify pass the public course description already gets —
    // one sanitizer is a single point of failure, and reusing it here means
    // this is not a second, drifting allowlist to maintain.
    <RichText
      html={bodyHtml}
      className="max-w-[var(--w-prose)] space-y-4 text-fg [&_h2]:text-[length:var(--fs-title-3)] [&_h2]:font-semibold [&_h3]:text-[length:var(--fs-title-4)] [&_h3]:font-medium [&_p]:text-fg-muted [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5"
    />
  );
}
