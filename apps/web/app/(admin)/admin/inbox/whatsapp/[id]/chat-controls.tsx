'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, PauseCircle, PlayCircle, Send } from 'lucide-react';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { Button } from '@ayman/ui/components/button';
import { patchWaChatAction, replyWaChatAction } from '../../../marketing/wa-bot-actions';

const c = bot.admin;

/**
 * The reply box and the two switches beside a chat. A reply goes out from the
 * linked number; the API then keeps the bot quiet here for the silence window
 * and closes the handoff, so there is nothing else to press after answering.
 */
export function ChatControls({
  id,
  needsHuman,
  botPaused,
}: {
  id: string;
  needsHuman: boolean;
  botPaused: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [pending, startTransition] = useTransition();

  function send() {
    const body = text.trim();
    if (!body) return;
    startTransition(async () => {
      const result = await replyWaChatAction(id, body);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setText('');
      toast.success(c.replySent, { id: `wa-reply-${id}` });
      router.refresh();
    });
  }

  function patch(next: { needsHuman?: boolean; botPaused?: boolean }) {
    startTransition(async () => {
      const result = await patchWaChatAction(id, next);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <aside className="flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <textarea
          rows={5}
          maxLength={2000}
          value={text}
          placeholder={c.replyPlaceholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send();
          }}
          className="w-full rounded-lg border border-line bg-surface-1 p-2.5 text-[length:var(--fs-text-sm)] text-fg [unicode-bidi:plaintext] focus:border-accent focus:outline-none"
        />
        <p className="mt-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">{c.replyHint}</p>
        <Button className="mt-2 w-full" onClick={send} disabled={pending || !text.trim()}>
          <Send className="size-4" aria-hidden="true" />
          {c.replySend}
        </Button>
      </div>

      <Button variant="secondary" onClick={() => patch({ needsHuman: !needsHuman })} disabled={pending}>
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {needsHuman ? c.markDone : c.markOpen}
      </Button>
      <Button variant="ghost" onClick={() => patch({ botPaused: !botPaused })} disabled={pending}>
        {botPaused ? <PlayCircle className="size-4" aria-hidden="true" /> : <PauseCircle className="size-4" aria-hidden="true" />}
        {botPaused ? c.resumeBot : c.pauseBot}
      </Button>
    </aside>
  );
}
