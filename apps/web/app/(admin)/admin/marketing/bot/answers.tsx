'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { MessageSquareText, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import type { BotAnswerRow } from '@ayman/contracts/wa-bot/schemas';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { Switch } from '@ayman/ui/components/switch';
import { cn } from '@ayman/ui/lib/cn';
import { createBotAnswerAction, resetBotAnswerAction, saveBotAnswerAction } from '../wa-bot-actions';

const c = bot.admin;

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * The ready answers — one card per intent, each with its text, its words and
 * a switch, and the admin's own answers after them.
 *
 * The built-in vocabulary is shown, read-only, as a count with the words
 * behind it: the admin adds to it, never edits it (see `DEFAULT_KEYWORDS`).
 */
export function BotAnswers({ rows }: { rows: BotAnswerRow[] }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{c.answersTitle}</h2>
          <p className="max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.answersLead}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <AnswerCard key={row.key} row={row} />
        ))}
        <NewAnswerCard />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{c.placeholdersTitle}</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {bot.placeholders.map(([token, meaning]) => (
              <div key={token} className="flex gap-2 text-[length:var(--fs-text-sm)]">
                <dt className="mono shrink-0 text-accent-text">{token}</dt>
                <dd className="text-fg-muted">{meaning}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </section>
  );
}

function AnswerCard({ row }: { row: BotAnswerRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState(row.answer);
  const [keywords, setKeywords] = useState(row.keywords.join('\n'));
  const [label, setLabel] = useState(row.label);
  const [enabled, setEnabled] = useState(row.enabled);
  const [pending, startTransition] = useTransition();
  const silentByDesign = row.key === 'thanks';

  function save() {
    startTransition(async () => {
      const result = await saveBotAnswerAction(row.key, {
        // «شكرًا» never sends a word; the column still needs one.
        answer: silentByDesign ? '—' : answer.trim() || row.answer,
        keywords: lines(keywords),
        enabled,
        ...(row.builtIn ? {} : { label: label.trim() || row.label }),
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(c.saved, { id: `wa-answer-${row.key}` });
      setOpen(false);
      router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetBotAnswerAction(row.key);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (row.defaultAnswer !== null) {
        setAnswer(row.defaultAnswer);
        setKeywords('');
        setEnabled(true);
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Card className={cn(!row.enabled && 'opacity-70')}>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'grid size-8 place-items-center rounded-lg',
              row.builtIn ? 'bg-accent/15 text-accent-text' : 'bg-[color-mix(in_oklch,var(--info),transparent_85%)] text-[color:var(--info)]',
            )}
          >
            <MessageSquareText className="size-4" />
          </span>
          <span className="font-semibold text-fg">{row.label}</span>
          <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            {row.builtIn ? c.builtIn : c.custom}
          </span>
          {row.builtIn && row.customized ? (
            <span className="rounded-full bg-[color-mix(in_oklch,var(--warn),transparent_86%)] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-[color:var(--warn)]">
              {c.customized}
            </span>
          ) : null}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)]',
              row.enabled
                ? 'bg-[color-mix(in_oklch,var(--ok),transparent_86%)] text-[color:var(--ok)]'
                : 'bg-[color-mix(in_oklch,var(--err),transparent_86%)] text-[color:var(--err)]',
            )}
          >
            {row.enabled ? c.enabledChip : c.disabledChip}
          </span>
          <Button size="sm" variant="secondary" className="ms-auto" onClick={() => setOpen((v) => !v)}>
            {open ? c.close : c.edit}
          </Button>
        </div>

        {!open ? (
          silentByDesign ? null : (
            <p className="line-clamp-4 whitespace-pre-wrap [unicode-bidi:plaintext] text-[length:var(--fs-text-sm)] text-fg-muted">
              {row.answer}
            </p>
          )
        ) : (
          <div className="flex flex-col gap-3">
            {!row.builtIn ? (
              <label className="flex flex-col gap-1">
                <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.customLabel}</span>
                <input
                  value={label}
                  maxLength={80}
                  onChange={(event) => setLabel(event.target.value)}
                  className="h-9 rounded-lg border border-line bg-surface-2 px-2.5 text-fg focus:border-accent focus:outline-none"
                />
              </label>
            ) : null}
            {silentByDesign ? null : (
              <label className="flex flex-col gap-1">
                <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.answerText}</span>
                <textarea
                  rows={7}
                  maxLength={1500}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  className="rounded-lg border border-line bg-surface-2 p-2.5 text-[length:var(--fs-text-sm)] text-fg [unicode-bidi:plaintext] focus:border-accent focus:outline-none"
                />
              </label>
            )}
            {row.defaultKeywords.length > 0 ? (
              <details className="rounded-lg border border-line-subtle p-2.5">
                <summary className="cursor-pointer text-[length:var(--fs-text-sm)] text-fg-muted">
                  {c.defaultKeywords} · {c.keywordsCount.replace('{count}', String(row.defaultKeywords.length))}
                </summary>
                <div className="mt-2 flex flex-wrap gap-1">
                  {row.defaultKeywords.map((word) => (
                    <span key={word} className="rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                      {word}
                    </span>
                  ))}
                </div>
              </details>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">
                {row.builtIn ? c.extraKeywords : c.customKeywordsLabel}
              </span>
              <textarea
                rows={3}
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                className="rounded-lg border border-line bg-surface-2 p-2.5 text-[length:var(--fs-text-sm)] text-fg focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
              <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={c.answerEnabled} />
              {c.answerEnabled}
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={pending}>
                {c.save}
              </Button>
              {row.builtIn && row.customized ? (
                <Button variant="ghost" onClick={reset} disabled={pending}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {c.resetDefault}
                </Button>
              ) : null}
              {!row.builtIn ? (
                <Button variant="danger" onClick={reset} disabled={pending}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  {c.deleteCustom}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function NewAnswerCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [keywords, setKeywords] = useState('');
  const [answer, setAnswer] = useState('');
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const result = await createBotAnswerAction({
        label: label.trim(),
        answer: answer.trim(),
        keywords: lines(keywords),
        enabled: true,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setLabel('');
      setKeywords('');
      setAnswer('');
      setOpen(false);
      toast.success(c.saved, { id: 'wa-answer-new' });
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line',
          'text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/50 hover:text-fg',
        )}
      >
        <Plus className="size-6" aria-hidden="true" />
        {c.addCustom}
      </button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.addCustom}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.customLabel}</span>
          <input
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            className="h-9 rounded-lg border border-line bg-surface-2 px-2.5 text-fg focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.customKeywordsLabel}</span>
          <textarea
            rows={3}
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            className="rounded-lg border border-line bg-surface-2 p-2.5 text-[length:var(--fs-text-sm)] text-fg focus:border-accent focus:outline-none"
          />
          <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.customKeywordsHint}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.answerText}</span>
          <textarea
            rows={5}
            maxLength={1500}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="rounded-lg border border-line bg-surface-2 p-2.5 text-[length:var(--fs-text-sm)] text-fg [unicode-bidi:plaintext] focus:border-accent focus:outline-none"
          />
        </label>
        <div className="flex gap-2">
          <Button onClick={create} disabled={pending || !label.trim() || !answer.trim() || lines(keywords).length === 0}>
            {c.save}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {c.close}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
