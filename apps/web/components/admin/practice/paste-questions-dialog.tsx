'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { formatCopy } from '@ayman/contracts/format';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { addPracticeQuestions } from '@/app/(admin)/admin/practice/actions';
import { blockLabel, parsePastedQuestions, type PasteBlock } from './practice-model';
import { QuestionExplanation, QuestionOptions } from './question-body';

const p = c.paste;

/**
 * «لصق أسئلة كتير» — the question bank's paste format, previewed block by
 * block, sent as ONE batch.
 *
 * All or nothing on purpose: the button stays off while any block has a
 * problem. Sending the good thirty-eight and dropping two would leave the set
 * two questions short with nothing on screen saying which — and the fix (the
 * text) is right there in the box, beside the error that names its paragraph.
 *
 * The preview is the parsed RESULT, key highlighted, not an echo of the text:
 * «الإجابة: ب» on a block whose «ب)» line the parser did not read as an
 * option shows up here as the wrong row in green, before anyone answers it.
 */
export function PasteQuestionsDialog({
  setId,
  triggerClassName,
}: {
  setId: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [parsedText, setParsedText] = useState('');
  const [busy, setBusy] = useState(false);

  // Debounced like the bank's dialog: the parser is cheap, re-rendering a
  // hundred preview cards on every keystroke is not.
  useEffect(() => {
    const timer = setTimeout(() => setParsedText(text), 200);
    return () => clearTimeout(timer);
  }, [text]);

  const blocks: PasteBlock[] = useMemo(() => parsePastedQuestions(parsedText), [parsedText]);
  const ready = blocks.filter((block): block is Extract<PasteBlock, { ok: true }> => block.ok);
  const bad = blocks.length - ready.length;
  // Never against a stale parse: the debounce must have caught up with the box.
  const canCommit = !busy && ready.length > 0 && bad === 0 && parsedText === text && ready.length <= 200;

  async function commit() {
    if (!canCommit) return;
    setBusy(true);
    try {
      const result = await addPracticeQuestions(
        setId,
        ready.map((block) => block.question),
      );
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(formatCopy(p.added, { count: arabicCount(ready.length, c.counts.questions) }));
      setText('');
      setParsedText('');
      setOpen(false);
      // Same reason as `bulk-import-dialog.tsx`: the router may otherwise
      // reuse the pre-paste render for 30 seconds.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={triggerClassName ?? 'chip chip--accent'}>
          <ClipboardPaste className="size-4" aria-hidden="true" />
          {c.editor.paste}
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={c.actions.close} className="max-w-[920px]">
        <DialogHeader>
          <DialogTitle>{p.title}</DialogTitle>
          <DialogDescription>{p.lead}</DialogDescription>
        </DialogHeader>

        <div className="prx-paste">
          <div className="flex flex-col gap-2">
            <label className="prx-field__label" htmlFor="practice-paste-text">
              {p.textLabel}
            </label>
            <Textarea
              id="practice-paste-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-72 font-mono"
              dir="auto"
            />
            <details>
              <summary className="prx-hint cursor-pointer">{p.exampleHeading}</summary>
              <pre className="prx-paste__example mt-2" dir="rtl">
                {p.example}
              </pre>
            </details>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <p className="prx-field__label">{p.previewHeading}</p>
            {blocks.length === 0 ? (
              <p className="prx-hint">{p.previewEmpty}</p>
            ) : (
              <>
                <p className="prx-paste__summary" aria-live="polite">
                  <span className="prx-tag prx-tag--published">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    {formatCopy(p.summaryReady, { n: ready.length })}
                  </span>
                  {bad > 0 ? (
                    <span className="prx-tag prx-danger">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      {formatCopy(p.summaryBad, { n: bad })}
                    </span>
                  ) : null}
                </p>
                <ol className="prx-paste__list">
                  {blocks.map((block) => (
                    <li key={block.index} className={cn('prx-block', !block.ok && 'prx-block--bad')}>
                      <span className="prx-block__head">
                        {blockLabel(block.index)}
                        {block.ok ? (
                          <span className={cn('prx-type', block.question.type === 'tf' && 'prx-q--tf')}>
                            {c.question.types[block.question.type]}
                          </span>
                        ) : null}
                      </span>
                      {block.ok ? (
                        <>
                          <p className="prx-q__stem" dir="auto">
                            {block.question.stem}
                          </p>
                          <QuestionOptions
                            type={block.question.type}
                            options={block.question.options}
                            answer={block.question.answer}
                          />
                          {block.question.explanation ? (
                            <QuestionExplanation text={block.question.explanation} />
                          ) : null}
                        </>
                      ) : (
                        <p role="alert" className="prx-error">
                          {block.message}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          {bad > 0 ? <p className="prx-hint me-auto">{p.blockedByErrors}</p> : null}
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {c.actions.cancel}
          </Button>
          <Button type="button" onClick={commit} disabled={!canCommit}>
            {ready.length > 0
              ? formatCopy(p.commitN, { count: arabicCount(ready.length, c.counts.questions) })
              : p.commit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
