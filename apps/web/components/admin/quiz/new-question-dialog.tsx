'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy, type QuizPaper } from '@ayman/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui';
import { apiPost } from '@/lib/api';
import { QuestionForm } from './question-form';

const PublishedSchema = z.object({ ok: z.boolean() });
const CreatedSlotSchema = z.object({ id: z.string() });

const c = copy.quizAdmin;

/**
 * Write a question and put it in THIS exam, in one press.
 *
 * ## The gap this closes
 *
 * The exam builder offered «أضف سؤال من البنك» and «أضف مجموعة عشوائية», and
 * both require the question to already exist. An instructor looking at an empty
 * exam had no way to write one from here — reported as, simply, «أضيف أسئلة
 * إزاي؟».
 *
 * The editor was never missing: `/admin/questions/new` has always had the stem,
 * the options, the correct answer and the mark. What was missing was any path
 * to it from the one screen where you realise you need it, and a way back.
 * This is that path, and it does not leave the page.
 *
 * ## Why it also PUBLISHES
 *
 * `AddSlotDialog` filters the bank to `status === 'ready'`. So the honest
 * version of the old flow was: leave the exam, write a question, press
 * «انشر السؤال», come back, search for it, add it — and a question saved but
 * not published simply never appeared in the picker, with nothing on either
 * screen explaining why. Three of those five steps are bookkeeping.
 *
 * A question written HERE is written to be used HERE, so this publishes it and
 * attaches it. It is still an ordinary bank entry afterwards — reusable in
 * another quiz, editable from `/admin/questions/:id` — nothing about it is a
 * second kind of question.
 *
 * ## Order, and what happens if a step fails
 *
 * Write → publish → attach, and each step is only attempted if the one before
 * it succeeded. A failure part-way leaves a real, saved question in the bank
 * rather than nothing: the work is never lost, and the message says which half
 * did not happen so the instructor can finish it from the bank rather than
 * retyping. Rolling the question back on a failed attach would be the version
 * that loses work.
 */
export function NewQuestionDialog({
  quizId,
  paper,
  categories,
}: {
  quizId: string;
  paper: QuizPaper;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function attach(result: { bankEntryId: string; versionId: string; defaultMark: number }) {
    try {
      // `ready` is what `AddSlotDialog`'s picker filters on, and what the
      // quiz's own publish guard requires of every slot.
      await apiPost(`/api/admin/questions/${result.versionId}/publish`, PublishedSchema, {});
    } catch {
      // Saved, not attached. Say so plainly — the question is in the bank and
      // one press from usable, which is a different situation from "it failed".
      toast.error(c.newQuestionPublishFailed);
      setOpen(false);
      router.refresh();
      return;
    }

    try {
      await apiPost(`/api/admin/quizzes/${quizId}/slots`, CreatedSlotSchema, {
        bankEntryId: result.bankEntryId,
        // The mark the instructor typed on the question itself. A slot can
        // still be worth something different in a different quiz — this is the
        // sensible default, not a constraint.
        maxMark: result.defaultMark,
        paper,
      });
    } catch {
      toast.error(c.newQuestionAttachFailed);
      setOpen(false);
      router.refresh();
      return;
    }

    toast.success(c.newQuestionAdded);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* `primary`, unlike its two neighbours. On an exam with no questions
            this is the thing to press, and the two bank-backed buttons beside
            it do nothing useful until the bank has something in it. */}
        <Button type="button">{c.newQuestionHere}</Button>
      </DialogTrigger>
      {/* Wider than the default: this is a whole editor — stem, type, category,
          mark and a variable number of options — not a confirmation.

          It no longer carries its own `max-h-[85vh] overflow-y-auto`. That pair
          moved onto `DialogContent` itself, so every dialog in the product is
          bounded rather than just the one someone remembered — and because `cn`
          is tailwind-merge, a `max-h-*` left here would have WON over the base
          cap and quietly kept this editor on the older, worse unit. `85vh` is
          also `vh`, which on a phone measures the viewport with the URL bar
          collapsed and so still overflows while the bar is showing. */}
      <DialogContent closeLabel={copy.admin.common.close} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{c.newQuestionHere}</DialogTitle>
        </DialogHeader>

        {/*
          `key={String(open)}` remounts the form each time the dialog opens, so
          a second question starts blank instead of inheriting the first one's
          stem and options. `QuestionForm` holds its option rows in local state,
          which a re-open alone would not reset.
        */}
        <QuestionForm key={String(open)} categories={categories} onSaved={attach} />
      </DialogContent>
    </Dialog>
  );
}
