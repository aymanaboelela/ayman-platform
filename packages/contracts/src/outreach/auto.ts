import { z } from '@ayman/contracts/zod';
import { WHATSAPP_DEVICE_STATES } from '@ayman/contracts/marketing/campaign';
import { AUTO_WHATSAPP_KINDS } from '@ayman/contracts/outreach/kinds';

/**
 * The wire half of the two automatic WhatsApp kinds — «كمّل الدفع» and «الحساب
 * جاهز» — and of the intent record that makes the first one possible.
 *
 * ## Why the intent carries no path
 *
 * The deep link in the reminder is built by the API from the target itself
 * (`/courses/<slug>/subscribe`, `/store/orders/<id>/pay`), never from a string
 * the browser sent. A client-supplied path would put whatever a request said
 * into a WhatsApp message sent from the instructor's own number — only to the
 * student who sent it, but a link the platform did not choose is still not a
 * link the platform should be vouching for. The one thing the browser does
 * know that the API cannot rebuild is which MONTHS the checkout was opened
 * for, and those are ids the API checks against the course before using.
 */

export const CHECKOUT_TARGETS = ['course', 'book_order'] as const;
export type CheckoutTarget = (typeof CHECKOUT_TARGETS)[number];

/** `POST /api/checkout-intents` — «فتحت خطوة الدفع». */
export const CheckoutIntentInputSchema = z.object({
  target: z.enum(CHECKOUT_TARGETS),
  targetId: z.uuid(),
  /** `?month=a,b` on a course checkout. Ignored for a book order. */
  monthIds: z.array(z.uuid()).max(12).default([]),
});
export type CheckoutIntentInput = z.infer<typeof CheckoutIntentInputSchema>;

export const CheckoutIntentResultSchema = z.object({ ok: z.literal(true) });

/** The numbers for one of the two kinds. */
export const AutoKindStatsSchema = z.object({
  /** Checkouts opened / accounts made, last 30 days. */
  candidates: z.number().int().min(0),
  /** Messages written for this kind, last 30 days. */
  sent: z.number().int().min(0),
  /** Of those, how many went out over WhatsApp (not just into the chat). */
  sentWhatsapp: z.number().int().min(0),
  /** Of those, how many a device acknowledged — «وصلت», not «اتبعتت». */
  delivered: z.number().int().min(0),
  /**
   * Bought within the window after the message: 72 hours for a checkout
   * reminder, seven days for a sign-up nudge.
   */
  converted: z.number().int().min(0),
  /** The sale value of those purchases, in piastres. Never `isFree`. */
  revenueCents: z.number().int().min(0),
});
export type AutoKindStats = z.infer<typeof AutoKindStatsSchema>;

/** `GET /api/admin/outreach/auto` — the whole «رسايل الواتساب التلقائية» card. */
export const AutoOutreachOverviewSchema = z.object({
  device: z.enum(WHATSAPP_DEVICE_STATES),
  /** Inside 10:00–22:00 Cairo right now. */
  inWindow: z.boolean(),
  /** WhatsApp messages these two kinds sent today (Cairo day). */
  sentToday: z.number().int().min(0),
  dailyCap: z.number().int().min(1),
  checkout: AutoKindStatsSchema,
  signup: AutoKindStatsSchema,
  /** Waiting right now: past their delay and still inside the window. */
  dueNow: z.object({
    checkout: z.number().int().min(0),
    signup: z.number().int().min(0),
  }),
  samples: z.array(z.object({ kind: z.enum(AUTO_WHATSAPP_KINDS), body: z.string() })),
});
export type AutoOutreachOverview = z.infer<typeof AutoOutreachOverviewSchema>;
