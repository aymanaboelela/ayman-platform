'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { promoBannerLinkKind, type PromoBanner } from '@ayman/contracts/admin/promo-banners';
import { promoBannersCopy } from '@ayman/contracts/copy/promo-banners';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Switch } from '@ayman/ui/components/switch';
import { cn } from '@ayman/ui/lib/cn';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { useAdminCan } from '@/components/admin/permissions-context';
import { createPromoBannerAction, patchPromoBannerAction } from './actions';

const c = promoBannersCopy.admin;

export interface YearOption {
  year: number;
  label: string;
}

/**
 * «ضيف بانر» and «تعديل البانر» — one dialog, the same fields.
 *
 * ## The picture goes straight to the API
 *
 * `MediaKeyField` uploads from the browser with `lib/upload-client.ts`, not
 * through a Server Action — those cap their body at 1 MB and a phone photo is
 * three. The action below only ever carries the resulting storage KEY.
 *
 * ## Checked here first, and again on the server
 *
 * The link and the dates are checked before the action runs so the message
 * sits under the field that is wrong; the action re-parses with the same
 * schema and the API a third time, so nothing here is the gate.
 */
export function PromoBannerDialog({
  banner,
  yearOptions,
  disabled = false,
}: {
  /** `null` adds. */
  banner: PromoBanner | null;
  yearOptions: readonly YearOption[];
  /** At the cap — the add button explains rather than opening a form that
   *  will fail on save. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState<number[]>(banner?.years ?? []);
  const [isActive, setIsActive] = useState(banner?.isActive ?? true);
  const [errors, setErrors] = useState<{ image?: string; link?: string; window?: string; form?: string }>({});
  const [pending, start] = useTransition();
  // `home:read` alone opens the screen; the buttons that write are for
  // `home:write`, the permission every route behind them checks.
  const canWrite = useAdminCan('home:write');

  /* Back to the row's own values on every open — a cancelled edit must not
     leave its half-typed state for the next one. In the handler, not an
     effect: opening is an event. */
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setYears(banner?.years ?? []);
    setIsActive(banner?.isActive ?? true);
    setErrors({});
  }

  function toggleYear(year: number) {
    setYears((current) =>
      current.includes(year) ? current.filter((y) => y !== year) : [...current, year].sort((a, b) => a - b),
    );
  }

  function submit(form: FormData) {
    const text = (key: string) => {
      const value = String(form.get(key) ?? '').trim();
      return value === '' ? null : value;
    };
    const imageKey = text('imageKey');
    const title = text('title');
    const linkUrl = text('linkUrl');
    const startsOn = text('startsOn');
    const endsOn = text('endsOn');

    const next: typeof errors = {};
    if (!imageKey) next.image = c.imageMissing;
    if (linkUrl && promoBannerLinkKind(linkUrl) === null) next.link = c.linkInvalid;
    if (startsOn && endsOn && endsOn < startsOn) next.window = c.windowInvalid;
    setErrors(next);
    if (Object.keys(next).length > 0 || !imageKey) return;

    const payload = { imageKey, title, linkUrl, years, isActive, startsOn, endsOn };
    start(async () => {
      const result = banner
        ? await patchPromoBannerAction(banner.id, payload)
        : await createPromoBannerAction(payload);
      if (result.ok) {
        toast.success(c.saved);
        setOpen(false);
      } else {
        setErrors({ form: result.message });
      }
    });
  }

  if (!canWrite) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {banner ? (
          <Button type="button" variant="secondary" size="sm">
            <Pencil className="size-4" aria-hidden="true" />
            {c.edit}
          </Button>
        ) : (
          <Button type="button" disabled={disabled}>
            <Plus className="size-4" aria-hidden="true" />
            {c.add}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent closeLabel={c.cancel} className="max-h-[90vh] max-w-[40rem] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{banner ? c.editTitle : c.addTitle}</DialogTitle>
        </DialogHeader>

        <form action={submit} className="space-y-5">
          <div>
            <MediaKeyField
              name="imageKey"
              id="promo-banner-image"
              label={c.imageLabel}
              hint={c.imageHint}
              defaultValue={banner?.imageKey ?? null}
              shape="banner"
            />
            {errors.image ? (
              <p role="alert" className="mt-1 text-[length:var(--fs-text-sm)] text-err">
                {errors.image}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="promo-banner-title">{c.titleLabel}</Label>
            <Input id="promo-banner-title" name="title" maxLength={80} defaultValue={banner?.title ?? ''} />
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.titleHint}</p>
          </div>

          <div>
            <Label htmlFor="promo-banner-link">{c.linkLabel}</Label>
            <Input
              id="promo-banner-link"
              name="linkUrl"
              dir="ltr"
              inputMode="url"
              maxLength={500}
              placeholder="/library"
              defaultValue={banner?.linkUrl ?? ''}
              aria-invalid={errors.link ? true : undefined}
            />
            {errors.link ? (
              <p role="alert" className="mt-1 text-[length:var(--fs-text-sm)] text-err">
                {errors.link}
              </p>
            ) : (
              <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.linkHint}</p>
            )}
          </div>

          {/* Toggle chips rather than checkboxes: three short choices read at
              a glance, and «كل الطلبة» lights up by itself when none is on —
              the empty list's meaning is said, not implied. */}
          <fieldset>
            <legend className="mb-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">{c.yearsLabel}</legend>
            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-3 py-1 text-[length:var(--fs-text-sm)]',
                  years.length === 0
                    ? 'border-transparent bg-accent/15 font-semibold text-accent-text'
                    : 'border-line text-fg-muted',
                )}
              >
                {c.yearsAll}
              </span>
              {yearOptions.map((option) => {
                const on = years.includes(option.year);
                return (
                  <button
                    key={option.year}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleYear(option.year)}
                    className={cn(
                      'inline-flex items-center rounded-full border px-3 py-1 text-[length:var(--fs-text-sm)] transition-colors',
                      on
                        ? 'border-transparent bg-accent font-semibold text-[color:var(--on-accent-ink)]'
                        : 'border-line bg-surface-1 text-fg hover:bg-surface-2',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.yearsHint}</p>
          </fieldset>

          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="promo-banner-starts">{c.startsOnLabel}</Label>
                <Input
                  id="promo-banner-starts"
                  name="startsOn"
                  type="date"
                  dir="ltr"
                  defaultValue={banner?.startsOn ?? ''}
                />
              </div>
              <div>
                <Label htmlFor="promo-banner-ends">{c.endsOnLabel}</Label>
                <Input
                  id="promo-banner-ends"
                  name="endsOn"
                  type="date"
                  dir="ltr"
                  defaultValue={banner?.endsOn ?? ''}
                  aria-invalid={errors.window ? true : undefined}
                />
              </div>
            </div>
            {errors.window ? (
              <p role="alert" className="mt-1 text-[length:var(--fs-text-sm)] text-err">
                {errors.window}
              </p>
            ) : (
              <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.windowHint}</p>
            )}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-[var(--r-lg)] border border-line bg-surface-2 p-3">
            <div>
              <Label htmlFor="promo-banner-active">{c.activeLabel}</Label>
              <p className="text-[length:var(--fs-text-sm)] text-fg-subtle">{c.activeHint}</p>
            </div>
            <Switch id="promo-banner-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {errors.form ? (
            <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
              {errors.form}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {c.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {c.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
