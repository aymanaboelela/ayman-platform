'use client';

import { useActionState, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import { Textarea } from '@ayman/ui/components/textarea';
import { formatEGP } from '@/lib/price';
import { uploadBookOrderScreenshot } from '@/lib/upload-client';
import { adminCreateBookOrderAction, type ActionResult } from './actions';

const c = copy.admin.books;
const IDLE: ActionResult = { ok: true };

export interface BookableCourse {
  id: string;
  title: string;
  bookTitle: string;
  bookPriceCents: number;
}

/**
 * «أضف طلب كتاب» — an admin entering a customer's order directly, rather
 * than the customer going through the public/guest form on the course page.
 * Same field set as that form (see `apps/web/components/site
 * /book-order-panel.tsx`), plus ONE control that flow never has: whether to
 * mark it paid right away. Reaches `BookOrdersService.adminCreate` through
 * `adminCreateBookOrderAction` — the exact same kind of `BookOrder` row a
 * real customer's order would produce.
 */
export function CreateBookOrderDialog({
  courses,
  governorates,
}: {
  courses: BookableCourse[];
  governorates: Taxonomy['governorates'];
}) {
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const course = courses.find((entry) => entry.id === courseId);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [governorateCode, setGovernorateCode] = useState('');
  const [city, setCity] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressBuilding, setAddressBuilding] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const [paid, setPaid] = useState(false);
  const [senderPhone, setSenderPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);

  function resetForm() {
    setFullName('');
    setPhone('');
    setAltPhone('');
    setGovernorateCode('');
    setCity('');
    setAddressStreet('');
    setAddressBuilding('');
    setAddressNote('');
    setPaid(false);
    setSenderPhone('');
    setFile(null);
  }

  // Closed from inside the action, not a `useEffect` — see `BanDialog`'s own
  // note in `account-access-section.tsx` for why.
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      let screenshotKey = '';
      if (paid && file) {
        const uploaded = await uploadBookOrderScreenshot(file);
        if (!uploaded.ok) return { ok: false, message: c.createUploadFailed };
        screenshotKey = uploaded.value.screenshotKey;
      }
      formData.set('screenshotKey', screenshotKey);

      const result = await adminCreateBookOrderAction(formData);
      if (result.ok) {
        setOpen(false);
        resetForm();
      }
      return result;
    },
    IDLE,
  );

  const canSubmit =
    course !== undefined &&
    fullName.trim().length >= 2 &&
    phone.trim().length > 0 &&
    altPhone.trim().length > 0 &&
    governorateCode !== '' &&
    city.trim().length > 0 &&
    addressStreet.trim().length > 0;

  if (courses.length === 0) {
    return <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.createNoCourses}</p>;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">{c.createButton}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{c.createDialogTitle}</DialogTitle>
        </DialogHeader>

        <form action={action} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pe-1">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="fullName" value={fullName} />
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="altPhone" value={altPhone} />
          <input type="hidden" name="governorateCode" value={governorateCode} />
          <input type="hidden" name="city" value={city} />
          <input type="hidden" name="addressStreet" value={addressStreet} />
          <input type="hidden" name="addressBuilding" value={addressBuilding} />
          <input type="hidden" name="addressNote" value={addressNote} />
          <input type="hidden" name="paid" value={String(paid)} />
          <input type="hidden" name="senderPhone" value={paid ? senderPhone : ''} />

          <div>
            <Label htmlFor="book-create-course">{c.createCourseLabel}</Label>
            <Select
              id="book-create-course"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              {courses.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} — {entry.bookTitle}
                </option>
              ))}
            </Select>
            {course ? (
              <p className="mt-1 mono text-[length:var(--fs-text-xs)] text-fg-muted">
                {formatCopy(c.createAmountLabel, { amount: formatEGP(course.bookPriceCents) })}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="book-create-full-name">{c.createFullNameLabel}</Label>
            <Input
              id="book-create-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="book-create-phone">{c.createPhoneLabel}</Label>
            <Input
              id="book-create-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              placeholder="01xxxxxxxxx"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="book-create-alt-phone">{c.createAltPhoneLabel}</Label>
            <Input
              id="book-create-alt-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              placeholder="01xxxxxxxxx"
              value={altPhone}
              onChange={(event) => setAltPhone(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="book-create-governorate">{c.createGovernorateLabel}</Label>
            <Select
              id="book-create-governorate"
              value={governorateCode}
              onChange={(event) => setGovernorateCode(event.target.value)}
            >
              <option value="">{c.createGovernoratePlaceholder}</option>
              {governorates.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.nameAr}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="book-create-city">{c.createCityLabel}</Label>
            <Input id="book-create-city" value={city} onChange={(event) => setCity(event.target.value)} />
          </div>

          <div>
            <Label htmlFor="book-create-street">{c.createAddressStreetLabel}</Label>
            <Input
              id="book-create-street"
              value={addressStreet}
              onChange={(event) => setAddressStreet(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="book-create-building">{c.createAddressBuildingLabel}</Label>
            <Input
              id="book-create-building"
              value={addressBuilding}
              onChange={(event) => setAddressBuilding(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="book-create-note">{c.createAddressNoteLabel}</Label>
            <Textarea
              id="book-create-note"
              rows={2}
              value={addressNote}
              onChange={(event) => setAddressNote(event.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-sm border border-line-subtle bg-surface-3 p-3">
            <div>
              <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">
                {paid ? c.createPaidLabel : c.createAddressOnlyLabel}
              </p>
              {paid ? (
                <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">{c.createPaidHint}</p>
              ) : null}
            </div>
            <Switch checked={paid} onCheckedChange={setPaid} aria-label={c.createPaidLabel} />
          </div>

          {paid ? (
            <>
              <div>
                <Label htmlFor="book-create-sender-phone">{c.createSenderPhoneLabel}</Label>
                <Input
                  id="book-create-sender-phone"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  placeholder="01xxxxxxxxx"
                  value={senderPhone}
                  onChange={(event) => setSenderPhone(event.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="book-create-screenshot">{c.createScreenshotLabel}</Label>
                <input
                  id="book-create-screenshot"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                <label
                  htmlFor="book-create-screenshot"
                  className="flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-line px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-150 ease-out hover:border-accent/40"
                >
                  <ImagePlus className="size-4 shrink-0" aria-hidden="true" strokeWidth={2} />
                  {file ? file.name : c.createScreenshotHint}
                </label>
              </div>
            </>
          ) : null}

          {!state.ok ? (
            <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {copy.admin.actions.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !canSubmit}>
              {pending ? c.createSubmitting : c.createSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
