'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Switch } from '@ayman/ui/components/switch';
import { createTermAction, setTermOpenAction, updateTermAction } from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { InlineTitle } from './inline-title';

const c = copy.admin.term;

type Term = AdminCourseDetail['terms'][number];

/** `''` → `null`; a whole-pounds string → EGP cents. Never negative. Same
 *  convention as `course-form.tsx`'s own `priceCentsOf` — kept local rather
 *  than shared, since that one is not exported and the two forms otherwise
 *  have nothing else in common. */
function priceCentsOf(pounds: string): number | null {
  const trimmed = pounds.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function poundsOf(cents: number | null): string {
  return cents === null ? '' : String(cents / 100);
}

/**
 * The term's own price, EGP pounds — same text-input-of-pounds convention as
 * the course's monthly/quarterly fields, committed on blur like
 * `InlineTitle` rather than through a save button.
 */
function TermPriceField({ courseId, term }: { courseId: string; term: Term }) {
  const router = useRouter();
  const [draft, setDraft] = useState(poundsOf(term.priceCents));
  const [pending, setPending] = useState(false);

  async function commit() {
    const priceCents = priceCentsOf(draft);
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
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={c.priceLabel}
      placeholder={copy.admin.course.priceNotForSale}
      value={draft}
      disabled={pending}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      className="w-24"
    />
  );
}

function TermRow({ courseId, term }: { courseId: string; term: Term }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle(nextOpen: boolean) {
    setPending(true);
    const result = await setTermOpenAction(courseId, term.id, nextOpen);
    setPending(false);
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

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line-subtle bg-surface-2 p-3">
      <InlineTitle
        value={term.title}
        label={c.titleLabel}
        onSave={async (title) => {
          const result = await updateTermAction(courseId, term.id, { title });
          if (result.ok) router.refresh();
          return result;
        }}
      />

      <div className="flex items-center gap-3">
        <TermPriceField courseId={courseId} term={term} />
        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {term.isOpen ? c.open : c.closed}
        </span>
        <Switch
          checked={term.isOpen}
          disabled={pending}
          onCheckedChange={(checked) => void toggle(checked)}
          aria-label={c.toggleLabel}
        />
      </div>
    </li>
  );
}

function AddTermForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [pending, setPending] = useState(false);

  async function submit() {
    const trimmed = title.trim();
    if (trimmed.length < 2) return;
    setPending(true);
    const result = await createTermAction(courseId, { title: trimmed, priceCents: priceCentsOf(price) });
    setPending(false);
    if (result.ok) {
      setTitle('');
      setPrice('');
      router.refresh();
    } else {
      toast.error(c.actionFailed);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <div className="min-w-[12rem] flex-1">
        <Label htmlFor="new-term-title">{c.titleLabel}</Label>
        <Input
          id="new-term-title"
          value={title}
          minLength={2}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="w-24">
        <Label htmlFor="new-term-price">{c.priceLabel}</Label>
        <Input
          id="new-term-price"
          type="number"
          min={0}
          placeholder={copy.admin.course.priceNotForSale}
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
      </div>
      <Button type="button" disabled={pending || title.trim().length < 2} onClick={() => void submit()}>
        {c.addTerm}
      </Button>
    </div>
  );
}

/** الترمين — the course editor's own term-management panel. */
export function TermPanel({ courseId, terms }: { courseId: string; terms: Term[] }) {
  return (
    <section>
      <h2 className="mb-1 text-[length:var(--fs-title-4)] font-semibold">{c.title}</h2>
      <p className="mb-3 max-w-[42rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>
      {terms.length === 0 ? (
        <p className="text-fg-muted">{c.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {terms.map((term) => (
            <TermRow key={term.id} courseId={courseId} term={term} />
          ))}
        </ul>
      )}
      <AddTermForm courseId={courseId} />
    </section>
  );
}
