'use client';

import { useState, useTransition } from 'react';
import { FlaskConical } from 'lucide-react';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import type { BotAction, BotPreview as Preview } from '@ayman/contracts/wa-bot/schemas';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { cn } from '@ayman/ui/lib/cn';
import { previewBotAction } from '../wa-bot-actions';

const c = bot.admin;

const ACTION_TONE: Record<BotAction, string> = {
  answer: 'var(--ok)',
  askYear: 'var(--info)',
  handoff: 'var(--warn)',
  model: 'var(--a-9)',
  silent: 'var(--err)',
};

/** «تجربة البوت» — the real brain, live facts, nothing sent. */
export function BotPreview() {
  const [text, setText] = useState('الكورس بكام؟');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const response = await previewBotAction(text, phone.trim() || null);
      if (response.ok) setResult(response.data);
      else setError(response.message);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-5 text-[color:var(--info)]" aria-hidden="true" />
          {c.previewTitle}
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.previewLead}</p>
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.previewText}</span>
          <textarea
            rows={2}
            maxLength={1000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="rounded-lg border border-line bg-surface-2 p-2.5 text-fg focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.previewPhone}</span>
          <input
            dir="ltr"
            value={phone}
            maxLength={20}
            placeholder="01012345678"
            onChange={(event) => setPhone(event.target.value)}
            className="mono h-9 w-56 rounded-lg border border-line bg-surface-2 px-2.5 text-fg focus:border-accent focus:outline-none"
          />
        </label>
        <div>
          <Button onClick={run} disabled={pending || !text.trim()}>
            {c.previewRun}
          </Button>
        </div>

        {error ? <p className="text-[color:var(--err)]">{error}</p> : null}

        {result ? (
          <div className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-surface-1 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-text-xs)]">
              <span
                style={{ ['--tone' as string]: ACTION_TONE[result.action] }}
                className="rounded-full bg-[color-mix(in_oklch,var(--tone),transparent_85%)] px-2 py-0.5 font-medium text-[color:var(--tone)]"
              >
                {c.previewAction[result.action]}
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-fg-muted">{c.previewWho[result.who]}</span>
              <span className="text-fg-muted">{c.previewIntents}:</span>
              {result.intents.length === 0 ? (
                <span className="text-fg-faint">{c.previewNothing}</span>
              ) : (
                result.intents.map((intent) => (
                  <span key={intent} className="rounded-full bg-accent/12 px-2 py-0.5 text-accent-text">
                    {(bot.labels as Record<string, string>)[intent] ?? intent}
                  </span>
                ))
              )}
            </div>
            {result.reply ? (
              <p
                className={cn(
                  'max-w-[34rem] whitespace-pre-wrap [unicode-bidi:plaintext] rounded-xl rounded-ss-sm p-3 text-[length:var(--fs-text-sm)] text-fg',
                  'bg-[color-mix(in_oklch,var(--ok),transparent_86%)]',
                )}
              >
                {result.reply}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
