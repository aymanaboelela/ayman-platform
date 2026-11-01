'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Percent, Banknote } from 'lucide-react';
import { AdminCouponCreateSchema, type AdminCouponRow } from '@ayman/contracts/admin/coupons';
import type { AdminUnlockCourseOption } from '@ayman/contracts/admin/unlock-codes';
import { adminCouponsCopy as c } from '@ayman/contracts/copy/admin-coupons';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Switch } from '@ayman/ui/components/switch';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { createCouponAction, updateCouponAction } from './actions';

/** `<input type="datetime-local">` is the admin's own clock; the API takes an
 *  instant. Empty is «من غير ميعاد». */
function toInstant(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** An instant as the value a `datetime-local` input shows, in the admin's own
 *  clock — the inverse of `toInstant`. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const optionalText = (n: number | null) => (n === null ? '' : String(n));

/** A blank number field is «مفتوح» — `null`, never `0`. */
function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Math.round(Number(trimmed));
  return Number.isFinite(n) ? n : null;
}

/**
 * «كوبون جديد», and the same form for «تعديل» when `coupon` is given — every
 * field stays editable (see `AdminCouponUpdateSchema`). Amounts are typed in POUNDS and sent in piastres, like every
 * money field on the admin side. The API is the judge of every bound
 * (`AdminCouponCreateSchema`), but its 400 is one generic sentence — so the
 * same schema runs here first, and the admin reads WHICH field is wrong
 * («النهاية لازم تبقى بعد البداية») instead of «فيه حاجة مش مظبوطة».
 */
export function CouponForm({
  courses,
  coupon,
  onSaved,
}: {
  courses: AdminUnlockCourseOption[];
  coupon?: AdminCouponRow;
  onSaved?: () => void;
}) {
  const router = useRouter();
  // The edit dialog renders a second copy of this form per row — ids must not collide.
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState(coupon?.code ?? '');
  const [kind, setKind] = useState<'percent' | 'fixed'>(coupon?.kind ?? 'percent');
  const [value, setValue] = useState(
    coupon ? optionalText(coupon.kind === 'percent' ? coupon.percentOff : (coupon.amountOffCents ?? 0) / 100) : '',
  );
  const [allCourses, setAllCourses] = useState(coupon?.allCourses ?? true);
  const [courseIds, setCourseIds] = useState<string[]>(coupon?.courses.map((course) => course.id) ?? []);
  const [startsAt, setStartsAt] = useState(toLocalInput(coupon?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(coupon?.endsAt ?? null));
  const [maxUses, setMaxUses] = useState(optionalText(coupon?.maxUses ?? null));
  const [maxPerStudent, setMaxPerStudent] = useState(coupon ? optionalText(coupon.maxUsesPerStudent) : '1');
  const [isActive, setIsActive] = useState(coupon?.isActive ?? true);
  const [note, setNote] = useState(coupon?.note ?? '');

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
    const input = {
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
    };
    const parsed = AdminCouponCreateSchema.safeParse(input);
    if (!parsed.success) {
      // Only the refines and the code regex carry Arabic sentences; a bare
      // bound (`.min(1)`) speaks zod's English, so it stays the generic line.
      const issue = parsed.error.issues[0];
      toast.error(issue && (issue.code === 'custom' || issue.code === 'invalid_format') ? issue.message : c.errors.invalid);
      return;
    }
    startTransition(async () => {
      const result = coupon ? await updateCouponAction(coupon.id, parsed.data) : await createCouponAction(parsed.data);
      if (result.ok) {
        toast.success(coupon ? c.saved : c.created);
        if (!coupon) reset();
        onSaved?.();
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
        <Label htmlFor={`${id}-code`}>{c.code}</Label>
        <Input
          id={`${id}-code`}
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
        <Label htmlFor={`${id}-value`}>{kind === 'percent' ? c.percentOff : c.amountOff}</Label>
        <Input
          id={`${id}-value`}
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
                          next === true ? [...current, course.id] : current.filter((courseId) => courseId !== course.id),
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
          <Label htmlFor={`${id}-starts`}>{c.startsAt}</Label>
          <Input id={`${id}-starts`} type="datetime-local" dir="ltr" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${id}-ends`}>{c.endsAt}</Label>
          <Input id={`${id}-ends`} type="datetime-local" dir="ltr" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        </div>
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.windowHint}</p>
      </div>

      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${id}-max`}>{c.maxUses}</Label>
          <Input id={`${id}-max`} type="number" inputMode="numeric" dir="ltr" min={1} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.maxUsesHint}</p>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${id}-per`}>{c.maxPerStudent}</Label>
          <Input id={`${id}-per`} type="number" inputMode="numeric" dir="ltr" min={1} max={100} value={maxPerStudent} onChange={(event) => setMaxPerStudent(event.target.value)} />
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.maxPerStudentHint}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-md border border-line-subtle bg-surface-1 p-3">
        <Switch id={`${id}-active`} checked={isActive} onCheckedChange={setIsActive} />
        <Label htmlFor={`${id}-active`}>{c.active}</Label>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-note`}>{c.note}</Label>
        <Textarea id={`${id}-note`} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>

      <div>
        <Button type="submit" disabled={pending || !code.trim() || !value || (!allCourses && courseIds.length === 0)}>
          {pending ? (coupon ? c.saving : c.creating) : coupon ? c.save : c.create}
        </Button>
      </div>
    </form>
  );
}
