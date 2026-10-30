'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Percent, Banknote } from 'lucide-react';
import type { AdminUnlockCourseOption } from '@ayman/contracts/admin/unlock-codes';
import { adminCouponsCopy as c } from '@ayman/contracts/copy/admin-coupons';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Switch } from '@ayman/ui/components/switch';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { createCouponAction } from './actions';

/** `<input type="datetime-local">` is the admin's own clock; the API takes an
 *  instant. Empty is «من غير ميعاد». */
function toInstant(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A blank number field is «مفتوح» — `null`, never `0`. */
function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Math.round(Number(trimmed));
  return Number.isFinite(n) ? n : null;
}

/**
 * «كوبون جديد». Amounts are typed in POUNDS and sent in piastres, like every
 * money field on the admin side. The API is the judge of every bound
 * (`AdminCouponCreateSchema`); a 400 comes back as one sentence.
 */
export function CouponForm({ courses }: { courses: AdminUnlockCourseOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [allCourses, setAllCourses] = useState(true);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [maxPerStudent, setMaxPerStudent] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [note, setNote] = useState('');

  function reset() {
    setCode('');
    setValue('');
    setCourseIds([]);
    setStartsAt('');
    setEndsAt('');
    setMaxUses('');
    setNote('');
  }

  function submit() {
    const amount = Number(value);
    startTransition(async () => {
      const result = await createCouponAction({
        code: code.trim().toUpperCase(),
        kind,
        percentOff: kind === 'percent' ? Math.round(amount) : null,
        amountOffCents: kind === 'fixed' ? Math.round(amount) * 100 : null,
        allCourses,
        courseIds: allCourses ? [] : courseIds,
        startsAt: toInstant(startsAt),
        endsAt: toInstant(endsAt),
        maxUses: optionalInt(maxUses),
        maxUsesPerStudent: optionalInt(maxPerStudent),
        isActive,
        note: note.trim() || null,
      });
      if (result.ok) {
        toast.success(c.created);
        reset();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  const kindButton = (next: 'percent' | 'fixed', label: string, Icon: typeof Percent) => (
    <button
      type="button"
      aria-pressed={kind === next}
      onClick={() => setKind(next)}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 font-semibold transition-colors',
        kind === next
          ? 'border-[color:var(--viz-4)] bg-[color-mix(in_oklab,var(--viz-4)_14%,var(--color-surface-1))] text-fg'
          : 'border-line-subtle bg-surface-1 text-fg-muted hover:text-fg',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="cp-code">{c.code}</Label>
        <Input
          id="cp-code"
          dir="ltr"
          required
          maxLength={32}
          autoComplete="off"
          spellCheck={false}
          className="mono uppercase"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\s/g, ''))}
        />
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.codeHint}</p>
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">{c.kind}</legend>
        <div className="flex gap-2">
          {kindButton('percent', c.kindPercent, Percent)}
          {kindButton('fixed', c.kindFixed, Banknote)}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="cp-value">{kind === 'percent' ? c.percentOff : c.amountOff}</Label>
        <Input
          id="cp-value"
          type="number"
          inputMode="numeric"
          dir="ltr"
          required
          min={1}
          max={kind === 'percent' ? 99 : 100_000}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">{c.scope}</legend>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={allCourses}
            onClick={() => setAllCourses(true)}
            className={cn('chip', allCourses && 'chip--solid')}
          >
            {c.scopeAll}
          </button>
          <button
            type="button"
            aria-pressed={!allCourses}
            onClick={() => setAllCourses(false)}
            className={cn('chip', !allCourses && 'chip--solid')}
          >
            {c.scopeSome}
          </button>
        </div>
        {!allCourses ? (
          <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-line-subtle bg-surface-1 p-2">
            {courses.map((course) => {
              const checked = courseIds.includes(course.id);
              return (
                <li key={course.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-surface-2">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) =>
                        setCourseIds((current) =>
                          next === true ? [...current, course.id] : current.filter((id) => id !== course.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{course.title}</span>
                    {!course.published ? (
                      <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.scopeDraft}</span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : null}
      </fieldset>

      {/* Stacked, not side by side: the form lives in a narrow sheet, so a
          viewport breakpoint says "wide" while the sheet is ~360px, and a
          datetime-local input's intrinsic width then spills out of its track. */}
      <div className="grid gap-4">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="cp-starts">{c.startsAt}</Label>
          <Input id="cp-starts" type="datetime-local" dir="ltr" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="cp-ends">{c.endsAt}</Label>
          <Input id="cp-ends" type="datetime-local" dir="ltr" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        </div>
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.windowHint}</p>
      </div>

      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="cp-max">{c.maxUses}</Label>
          <Input id="cp-max" type="number" inputMode="numeric" dir="ltr" min={1} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.maxUsesHint}</p>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="cp-per">{c.maxPerStudent}</Label>
          <Input id="cp-per" type="number" inputMode="numeric" dir="ltr" min={1} max={100} value={maxPerStudent} onChange={(event) => setMaxPerStudent(event.target.value)} />
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.maxPerStudentHint}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-md border border-line-subtle bg-surface-1 p-3">
        <Switch id="cp-active" checked={isActive} onCheckedChange={setIsActive} />
        <Label htmlFor="cp-active">{c.active}</Label>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="cp-note">{c.note}</Label>
        <Textarea id="cp-note" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>

      <div>
        <Button type="submit" disabled={pending || !code.trim() || !value || (!allCourses && courseIds.length === 0)}>
          {pending ? c.creating : c.create}
        </Button>
      </div>
    </form>
  );
}
