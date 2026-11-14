'use client';

import type { ReactNode } from 'react';
import { copy } from '@ayman/contracts/copy';
import { usePeerTyping } from '@/components/assistant/use-typing';

/**
 * A row's preview line, swapped for «جارٍ الكتابة…» while that student is
 * typing — the inbox list's half of the typing indicator, the way a
 * messenger's chat list shows it. The server-rendered preview is `children`
 * and comes straight back when the dots stop.
 */
export function RowTyping({ conversationId, children }: { conversationId: string; children: ReactNode }) {
  const typing = usePeerTyping(conversationId, 'visitor');
  if (!typing) return <>{children}</>;
  return <span className="font-medium text-accent-text">{copy.assistant.chat.typing}</span>;
}
