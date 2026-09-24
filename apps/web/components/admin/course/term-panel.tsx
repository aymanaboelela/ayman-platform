'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Switch } from '@ayman/ui/components/switch';
import { createTermAction, setTermOpenAction, updateTermAction } from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { parsePounds, poundsOf } from '@/lib/pounds';
import { InlineTitle } from './inline-title';

const c = copy.admin.term;

type Term = AdminCourseDetail['terms'][number];

/**
 * One term's price, as a field of «الاشتراك والتسعير».
 *
 * It used to sit four panels further down, in a term list outside the course
 * form entirely, so «كام سعر الكورس ده؟» had two answers on two parts of the
 * page. «التسعير ده أظبط معاه بتاعت الترم برضه، سعر الترم» — every price the
 * course sells at is now in the one block.
 *
 * Committed on blur (and on Enter), like every field here. Only after he
 * TYPED: the draft is reseeded from the server by the caller's `key`, so a
 * focus-and-blur can no longer write a stale price back over a newer one.
 */
function TermPriceField({ courseId, term }: { courseId: string; term: Term }) {
  const router = useRouter();
  const id = useId();
  const [draft, setDraft] = useState(poundsOf(term.priceCents));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);

  async function commit() {
    if (!dirty) return;
    setDirty(false);
    const parsed = parsePounds(draft);
    // A typo is not «مش للبيع». It used to be — `null` came back for anything
    // unreadable, and the term quietly left the storefront under a «اتحفظ».
    if (parsed.kind === 'invalid') {
      toast.error(copy.admin.course.priceInvalid);
      setDraft(poundsOf(term.priceCents));
      return;
    }
    const priceCents = parsed.kind === 'empty' ? null : parsed.cents;
    if (priceCents === term.priceCents) {
      setDraft(poundsOf(term.priceCents));
      return;
    }
    setPending(true);
    const result = await updateTermAction(courseId, term.id, { priceCents });
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      router.refresh();
    } else {
      toast.error(c.actionFailed);
      setDraft(poundsOf(term.priceCents));
    }
  }

  return (
    <div>
      <Label htmlFor={id}>{formatCopy(c.priceOf, { term: term.title })}</Label>
      {/* Text, not `type="number"`: a number field changes under the mouse
          wheel while focused, and blur then saved whatever the wheel left.
          Same shape as the monthly and yearly fields beside it. */}
      <Input
        id={id}
        dir="ltr"
        inputMode="decimal"
        placeholder={copy.admin.course.priceNotForSale}
        value={draft}
        disabled={pending}
        onChange={(event) => {
          setDraft(event.target.value);
          setDirty(true);
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </div>
  );
}

/** Every term's price, for the pricing block. Nothing on a course with no
 *  terms — the monthly and yearly fields are the whole answer there. */
export function TermPriceFields({ courseId, terms }: { courseId: string; terms: Term[] }) {
  if (terms.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {terms.map((term) => (
        // Keyed on the saved price as well: a price changed anywhere else
        // (another tab, another admin) reseeds the field instead of leaving a
        // stale draft for the next blur to write back.
        <TermPriceField key={`${term.id}:${term.priceCents ?? ''}`} courseId={courseId} term={term} />
      ))}
    </div>
  );
}

/**
 * One term: its name and whether it is open.
 *
 * ⚠️ CLOSING IS NOT A TOGGLE, and the switch now asks first.
 *
 * `TermService.setOpen` revokes every live grant behind the term in the same
 * transaction as the flag, and reopening does NOT give them back. It used to
 * be one click on a switch that sat beside the price field he types into —
 * the number of students it cut off arrived afterwards, in a toast. The
 * dialog names that number BEFORE the press; opening stays one click, because
 * it takes nothing from anybody.
 */
function TermRow({ courseId, term }: { courseId: string; term: Term }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const holders = term._count?.accessGrants ?? null;

  async function setOpen(nextOpen: boolean) {
    setPending(true);
    const result = await setTermOpenAction(courseId, term.id, nextOpen);
    setPending(false);
    setConfirming(false);
    if (!result.ok) {
      toast.error(c.actionFailed);
      return;
    }
    if (nextOpen) {
      toast.success(c.reopened);
    } else if ((result.revokedGrantCount ?? 0) > 0) {
      toast.success(formatCopy(c.closedRevoked, { n: result.revokedGrantCount ?? 0 }));
    } else {
      toast.success(c.closedNoOne);
    }
    router.refresh();
  }

  // What students can actually do with this term right now — «مفتوح» on a
  // term with no price read as «بيتباع» and it was not: the storefront only
  // lists open, PRICED terms.
  const state = !term.isOpen ? c.closed : term.priceCents === null ? c.openNoPrice : c.open;

  return (
    <li className="term-row">
      <div className="min-w-0 flex-1">
        <InlineTitle
          value={term.title}
          label={c.titleLabel}
          onSave={async (title) => {
            const result = await updateTermAction(courseId, term.id, { title });
            if (result.ok) router.refresh();
            // «PATCH /api/admin/terms/… failed with 400» is not a sentence.
            return result.ok ? result : { ok: false, message: c.actionFailed };
          }}
        />
      </div>
      <span className="term-row__state">{state}</span>
      <Switch
        checked={term.isOpen}
        disabled={pending}
        onCheckedChange={(checked) => {
          if (checked) void setOpen(true);
          else setConfirming(true);
        }}
        aria-label={`${c.toggleLabel} — ${term.title}`}
      />

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent closeLabel={copy.admin.common.close}>
          <DialogHeader>
            <DialogTitle>{formatCopy(c.closeTitle, { term: term.title })}</DialogTitle>
            <DialogDescription>{c.closeBody}</DialogDescription>
          </DialogHeader>
          <p className="text-[length:var(--fs-text-sm)] text-err">
            {holders === null
              ? c.closeHoldersUnknown
              : holders === 0
                ? c.closeHoldersNone
                : formatCopy(c.closeHolders, { n: holders })}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="sm">
                {copy.admin.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => void setOpen(false)}
            >
              {c.closeConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** The name the next term is born with — «الترم الأول», then «الترم التاني».
 *  Past two there is no obvious name, so he types one. */
function suggestedTitle(count: number): string | null {
  if (count === 0) return c.firstTitle;
  if (count === 1) return c.secondTitle;
  return null;
}

/**
 * «الترمين» — a small box under the book, which is where he asked for it:
 * «دول حطهم في جنب بوكس كده صغير تحت بتاعت الكتاب».
 *
 * Names and open/closed only; the PRICES are in the pricing block (see
 * `TermPriceFields`). And the two terms of the school year are one press
 * each, named for him — «ترم أول، ترم تاني» — rather than a form with an
 * empty title field that asked him to invent the obvious.
 */
export function TermsBox({ courseId, terms }: { courseId: string; terms: Term[] }) {
  const router = useRouter();
  const inputId = useId();
  const [pending, setPending] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const suggested = suggestedTitle(terms.length);

  async function add(title: string) {
    const trimmed = title.trim();
    if (trimmed.length < 2) return;
    setPending(true);
    // No price: an unpriced term is not on sale, so making one changes
    // nothing a student can see until he types a price above.
    const result = await createTermAction(courseId, { title: trimmed, priceCents: null });
    setPending(false);
    if (!result.ok) {
      toast.error(c.actionFailed);
      return;
    }
    setCustomTitle('');
    setCustomOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {terms.length === 0 ? (
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.empty}</p>
      ) : (
        <ul className="term-list">
          {terms.map((term) => (
            <TermRow key={term.id} courseId={courseId} term={term} />
          ))}
        </ul>
      )}

      {suggested !== null ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => void add(suggested)}
        >
          <Plus className="size-4" aria-hidden="true" />
          {formatCopy(c.addNamed, { term: suggested })}
        </Button>
      ) : customOpen ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add(customTitle);
          }}
        >
          <div className="min-w-[10rem] flex-1">
            <Label htmlFor={inputId}>{c.titleLabel}</Label>
            <Input
              id={inputId}
              value={customTitle}
              maxLength={160}
              onChange={(event) => setCustomTitle(event.target.value)}
            />
          </div>
          <Button type="submit" size="sm" disabled={pending || customTitle.trim().length < 2}>
            {c.addTerm}
          </Button>
        </form>
      ) : (
        <button
          type="button"
          className="text-[length:var(--fs-text-sm)] text-fg-muted underline underline-offset-2"
          onClick={() => setCustomOpen(true)}
        >
          {c.addAnother}
        </button>
      )}
    </div>
  );
}
