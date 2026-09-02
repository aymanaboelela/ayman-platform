'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AdminBookOrderRow } from '@ayman/contracts/admin/book-orders';
import type { AdminBookRow } from '@ayman/contracts/admin/books';
import { MAX_BOOK_QUANTITY, bookOrderTotals } from '@ayman/contracts/books';
import { copy } from '@ayman/contracts/copy/admin';
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
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import { formatEGP } from '@/lib/price';
import { adminPatchBookOrderAction } from './actions';

const c = copy.admin.books;

interface Line {
  bookId: string | null;
  titleAr: string;
  /** Pounds, as typed. Converted to piastres at submit — one boundary. */
  price: string;
  quantity: number;
}

/**
 * «أعدل الطلب» — everything about one order that an admin is allowed to change,
 * in one form: the basket, the delivery fee, the discount, the address and the
 * internal note.
 *
 * ## One dialog, one PATCH
 *
 * Changing a quantity and waiving delivery is one decision made in one phone
 * call. Splitting it across endpoints would let an order sit half-edited with
 * its total disagreeing with its lines — a state
 * `book_orders_amount_is_the_sum` rejects anyway, as a 500 nobody can act on.
 *
 * ## The total on screen is the total that will be stored
 *
 * Computed with `bookOrderTotals`, the same function the API uses to write the
 * row. The server recomputes rather than trusting this number — a total posted
 * from a form is a total that can disagree with the lines beside it — but
 * because both sides run one function, the preview here and the value stored
 * there cannot differ.
 *
 * ## What is deliberately NOT here
 *
 * `status`, the payment screenshot, and the two phone numbers. Shipping has its
 * own button and its own permission; an order's payment state is evidence
 * rather than a field. The phones are the one identifier a guest order has, and
 * correcting one deserves a deliberate act rather than a slot in the same form
 * as a quantity.
 */
export function EditBookOrderDialog({
  order,
  books,
  governorates,
}: {
  order: AdminBookOrderRow;
  /** The catalogue, for the «ضيف كتاب» picker. */
  books: AdminBookRow[];
  governorates: { code: string; nameAr: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [lines, setLines] = useState<Line[]>(() =>
    order.items.map((item) => ({
      bookId: item.bookId,
      titleAr: item.titleAr,
      price: String(item.unitPriceCents / 100),
      quantity: item.quantity,
    })),
  );
  const [shipping, setShipping] = useState(String(order.shippingCents / 100));
  const [discount, setDiscount] = useState(String(order.discountCents / 100));
  const [fullName, setFullName] = useState(order.fullName);
  const [governorateCode, setGovernorateCode] = useState(order.governorateCode);
  const [city, setCity] = useState(order.city);
  const [addressStreet, setAddressStreet] = useState(order.addressStreet);
  const [addressBuilding, setAddressBuilding] = useState(order.addressBuilding ?? '');
  const [addressNote, setAddressNote] = useState(order.addressNote ?? '');
  const [adminNote, setAdminNote] = useState(order.adminNote ?? '');

  /** Pounds → piastres. `Math.round` so a typed `250.5` never becomes a float. */
  const cents = (value: string): number => {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
  };

  const totals = bookOrderTotals(
    lines.map((line) => ({ unitPriceCents: cents(line.price), quantity: line.quantity })),
    cents(shipping),
    cents(discount),
  );

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function addFromCatalog(bookId: string) {
    const book = books.find((entry) => entry.id === bookId);
    if (!book) return;
    setLines((current) => [
      ...current,
      {
        bookId: book.id,
        titleAr: book.titleAr,
        /* Seeded from the catalogue and then EDITABLE — «هيدفع كام» is a real
           negotiation, and forcing it back through `books.price_cents` would
           mean changing the shop for everyone to give one person a discount. */
        price: String(book.priceCents / 100),
        quantity: 1,
      },
    ]);
  }

  function submit() {
    if (lines.length === 0) {
      setError(c.editNoItems);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await adminPatchBookOrderAction(order.id, {
        items: lines.map((line) => ({
          bookId: line.bookId,
          titleAr: line.titleAr.trim(),
          unitPriceCents: cents(line.price),
          quantity: line.quantity,
        })),
        shippingCents: cents(shipping),
        discountCents: cents(discount),
        fullName: fullName.trim(),
        governorateCode,
        city: city.trim(),
        addressStreet: addressStreet.trim(),
        addressBuilding: addressBuilding.trim() === '' ? null : addressBuilding.trim(),
        addressNote: addressNote.trim() === '' ? null : addressNote.trim(),
        adminNote: adminNote.trim() === '' ? null : adminNote.trim(),
      });

      if (result.ok) {
        setOpen(false);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          {c.editButton}
        </Button>
      </DialogTrigger>

      <DialogContent closeLabel={copy.admin.common.cancel}>
        <DialogHeader>
          <DialogTitle>{c.editDialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label>{c.editItemsLabel}</Label>
            <div className="mt-1 grid gap-2">
              {lines.map((line, index) => (
                <div
                  key={`${line.bookId ?? 'custom'}-${index}`}
                  className="grid grid-cols-[1fr_5.5rem_4rem_auto] items-end gap-2"
                >
                  <div>
                    <Label
                      htmlFor={`line-title-${index}`}
                      className="text-[length:var(--fs-text-xs)]"
                    >
                      {c.editItemTitleLabel}
                    </Label>
                    <Input
                      id={`line-title-${index}`}
                      value={line.titleAr}
                      onChange={(event) => updateLine(index, { titleAr: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor={`line-price-${index}`}
                      className="text-[length:var(--fs-text-xs)]"
                    >
                      {c.editItemPriceLabel}
                    </Label>
                    <Input
                      id={`line-price-${index}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      dir="ltr"
                      value={line.price}
                      onChange={(event) => updateLine(index, { price: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor={`line-qty-${index}`}
                      className="text-[length:var(--fs-text-xs)]"
                    >
                      {c.editItemQuantityLabel}
                    </Label>
                    <Input
                      id={`line-qty-${index}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_BOOK_QUANTITY}
                      dir="ltr"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(index, {
                          quantity: Math.max(
                            1,
                            Math.min(MAX_BOOK_QUANTITY, Number(event.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={c.editRemoveItem}
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="add-book" className="text-[length:var(--fs-text-xs)]">
                  {c.editPickBook}
                </Label>
                <Select
                  id="add-book"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) addFromCatalog(event.target.value);
                  }}
                >
                  <option value="">{c.editAddItem}</option>
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.titleAr} — {formatEGP(book.priceCents)} ج
                    </option>
                  ))}
                </Select>
              </div>

              {/* «ضيف سطر من غير كتالوج» — a line for something the shop does
                  not carry. `bookId: null`, which the unique index deliberately
                  does not constrain, so several are legitimate on one order. */}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    { bookId: null, titleAr: '', price: '0', quantity: 1 },
                  ])
                }
              >
                <Plus size={16} aria-hidden="true" />
                {c.editAddCustom}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="order-shipping">{c.editShippingLabel}</Label>
              <Input
                id="order-shipping"
                type="number"
                inputMode="decimal"
                min={0}
                dir="ltr"
                value={shipping}
                onChange={(event) => setShipping(event.target.value)}
                aria-describedby="order-shipping-hint"
              />
              <p
                id="order-shipping-hint"
                className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted"
              >
                {c.editShippingHint}
              </p>
            </div>

            <div>
              <Label htmlFor="order-discount">{c.editDiscountLabel}</Label>
              <Input
                id="order-discount"
                type="number"
                inputMode="decimal"
                min={0}
                dir="ltr"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </div>
          </div>

          {/* The live total, from the same `bookOrderTotals` the API writes
              with — so what is previewed here is what gets stored. */}
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[length:var(--fs-text-sm)] font-semibold text-fg">
            {c.editTotalLabel}: {formatEGP(totals.totalCents)} ج
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="order-name">{c.createFullNameLabel}</Label>
              <Input
                id="order-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="order-governorate">{c.createGovernorateLabel}</Label>
              <Select
                id="order-governorate"
                value={governorateCode}
                onChange={(event) => setGovernorateCode(event.target.value)}
              >
                {governorates.map((governorate) => (
                  <option key={governorate.code} value={governorate.code}>
                    {governorate.nameAr}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="order-city">{c.createCityLabel}</Label>
              <Input id="order-city" value={city} onChange={(event) => setCity(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="order-street">{c.createAddressStreetLabel}</Label>
              <Input
                id="order-street"
                value={addressStreet}
                onChange={(event) => setAddressStreet(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="order-building">{c.createAddressBuildingLabel}</Label>
              <Input
                id="order-building"
                value={addressBuilding}
                onChange={(event) => setAddressBuilding(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="order-address-note">{c.createAddressNoteLabel}</Label>
              <Input
                id="order-address-note"
                value={addressNote}
                onChange={(event) => setAddressNote(event.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="order-admin-note">{c.adminNoteLabel}</Label>
            <Textarea
              id="order-admin-note"
              rows={2}
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              aria-describedby="order-admin-note-hint"
            />
            <p
              id="order-admin-note-hint"
              className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted"
            >
              {c.adminNoteHint}
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? c.editSubmitting : c.editSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
