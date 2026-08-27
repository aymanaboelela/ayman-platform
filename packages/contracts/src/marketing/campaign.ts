import { z } from '@ayman/contracts/zod';
import { DEFAULT_PACING } from '@ayman/contracts/marketing/pacing';
import { SchoolStreamSchema } from '@ayman/contracts/onboarding';

/**
 * «حملة واتساب» — the shapes the admin screen, the API and the sender all
 * agree on.
 *
 * ## What a campaign IS, and the one thing it is not
 *
 * It is a frozen list of phone numbers plus one message template, drained at
 * a deliberately human speed by a number the instructor owns. It is NOT a
 * broadcast: there is no fan-out primitive anywhere in it, every recipient is
 * a row, and every row records what happened to it. That is what makes it
 * pausable, resumable, auditable, and — the part that matters — stoppable
 * after thirty wrong messages instead of four thousand.
 *
 * ## Why the audience is resolved once, at creation
 *
 * The recipient rows are written when the campaign is created, not looked up
 * per send. A campaign that re-queried «كل الطلبة» on every message would
 * change size under a run that takes days, would double-send anybody whose
 * profile was edited mid-run, and could never answer «فاضل كام». Freezing the
 * list makes the progress bar mean something.
 */

export const CAMPAIGN_STATUSES = ['draft', 'running', 'paused', 'done', 'cancelled'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const RECIPIENT_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

/**
 * The placeholder the instructor types. ONE, deliberately.
 *
 * A template language is a support burden and an injection surface, and the
 * only substitution a WhatsApp blast actually needs is the name — it is what
 * makes two hundred identical messages two hundred different messages, which
 * is a deliverability property and not only a courtesy.
 */
export const NAME_TOKEN = '{{الاسم}}';
/** Optional; when absent and a link is attached, the link is appended. */
export const LINK_TOKEN = '{{اللينك}}';

/**
 * Who gets it.
 *
 * Empty arrays mean "no filter on this axis", never "nobody" — the same
 * convention the admin list filters use, and the one the form's «الكل»
 * checkbox maps onto. `students: false, parents: false, extraPhones: []`
 * resolves to zero recipients and the API refuses to start such a campaign
 * rather than quietly running an empty one.
 */
export const AudienceSchema = z.object({
  /** The student's own number (`users.phone_number`). */
  students: z.boolean(),
  /**
   * `student_profiles.father_phone` / `mother_phone`.
   *
   * Off by default and worth its own switch: a parent never gave this
   * platform permission to message them, they only gave a contact number.
   * Reaching them is legitimate for «ابنك مذاكرش» and is not legitimate for
   * an ad, and the person choosing has to make that call per campaign.
   */
  parents: z.boolean(),
  /** `student_profiles.year` — 1/2/3. Empty = every year. */
  years: z.array(z.number().int().min(1).max(3)),
  /** `student_profiles.school_stream` — عام/لغات. Empty = every stream,
   *  same convention as `years`. `.default([])` so a campaign row written
   *  before this field existed still parses. */
  schoolStreams: z.array(SchoolStreamSchema).default([]),
  /** Enrolled in ANY of these courses. Empty = regardless of enrolment. */
  courseIds: z.array(z.uuid()),
  /**
   * Of the students matched above who are enrolled in one of `courseIds`,
   * keep only the ones who do NOT currently hold a valid grant for it —
   * "signed up but never paid" or "paid, and it lapsed." Meaningless with no
   * `courseIds` selected (there is no course to check "subscribed" against),
   * so `AudienceService` treats it as a no-op in that case. `.default(false)`
   * for the same reason as `schoolStreams` above.
   */
  notSubscribedOnly: z.boolean().default(false),
  /**
   * Numbers pasted by hand, already normalised to E.164 by the API.
   *
   * The riskiest audience on this list by a distance — a number that has
   * never heard of the sender is the one that blocks and reports, and blocks
   * are what actually get a WhatsApp number banned. Capped so a spreadsheet
   * cannot be pasted in wholesale.
   */
  extraPhones: z.array(z.string()).max(500),
});
export type Audience = z.infer<typeof AudienceSchema>;

export const EMPTY_AUDIENCE: Audience = {
  students: true,
  parents: false,
  years: [],
  schoolStreams: [],
  courseIds: [],
  notSubscribedOnly: false,
  extraPhones: [],
};

/**
 * The four brakes, as the admin may set them.
 *
 * The ceilings are not the form's business — they are the product refusing to
 * be turned into a spam cannon by an impatient afternoon. `dailyCap` tops out
 * at 1000 and the gap cannot go below 5 seconds, because past those numbers
 * the question stops being "will this number get banned" and becomes "when".
 */
const PacingShape = z.object({
    minDelaySeconds: z.number().int().min(5).max(3600),
    maxDelaySeconds: z.number().int().min(5).max(3600),
    batchSize: z.number().int().min(0).max(500),
    batchPauseMinutes: z.number().int().min(0).max(720),
    dailyCap: z.number().int().min(1).max(1000),
    windowStartHour: z.number().int().min(0).max(23),
  windowEndHour: z.number().int().min(1).max(24),
});

/** The same fields with no cross-field rules — for RESPONSES, where the data
 *  is already known good and a refinement would only cost a parse. */
export const PacingViewSchema = PacingShape;

export const PacingSchema = PacingShape
  .refine((p) => p.maxDelaySeconds >= p.minDelaySeconds, {
    message: 'أقصى مدة بين الرسايل لازم تكون أكبر من أقلها أو تساويها',
    path: ['maxDelaySeconds'],
  })
  .refine((p) => p.windowEndHour > p.windowStartHour, {
    message: 'ساعة الإقفال لازم تكون بعد ساعة الفتح',
    path: ['windowEndHour'],
  });

/** The same numbers `DEFAULT_PACING` carries, as a form seed. */
export const DEFAULT_PACING_INPUT = DEFAULT_PACING;

/**
 * The message itself.
 *
 * 900 characters rather than WhatsApp's own 4096: a blast long enough to
 * scroll does not get read, and the ceiling is a design constraint on the
 * instructor rather than a technical one.
 */
export const CampaignCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  body: z.string().trim().min(4).max(900),
  /** Attached above the text as a WhatsApp image message. */
  imageAssetId: z.uuid().nullable(),
  linkUrl: z
    .string()
    .trim()
    .url()
    .refine((v) => v.startsWith('https://') || v.startsWith('http://'), {
      message: 'اللينك لازم يبدأ بـ http:// أو https://',
    })
    .nullable(),
  audience: AudienceSchema,
  pacing: PacingSchema,
});
export type CampaignCreate = z.infer<typeof CampaignCreateSchema>;

/**
 * What a draft may still have changed.
 *
 * ⚠️ Written out field by field rather than `CampaignCreateSchema.partial()`.
 * `.partial()` keeps every `.default()` underneath it, which is how a rename
 * once un-published a lecture on this platform — a PATCH carrying only
 * `{ name }` arrived at the service with the whole object re-defaulted. There
 * are no defaults in the schema above precisely so that trap cannot reappear,
 * and this stays explicit so it cannot be reintroduced by adding one.
 */
export const CampaignPatchSchema = z
  .object({
    name: CampaignCreateSchema.shape.name,
    body: CampaignCreateSchema.shape.body,
    imageAssetId: CampaignCreateSchema.shape.imageAssetId,
    linkUrl: CampaignCreateSchema.shape.linkUrl,
    pacing: PacingSchema,
  })
  .partial();
export type CampaignPatch = z.infer<typeof CampaignPatchSchema>;

/** Live counters, computed rather than stored — see `CampaignDetail`. */
export const CampaignCountsSchema = z.object({
  total: z.number().int(),
  pending: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
});
export type CampaignCounts = z.infer<typeof CampaignCountsSchema>;

export const CampaignRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
  counts: CampaignCountsSchema,
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  nextSendAt: z.iso.datetime().nullable(),
});
export type CampaignRow = z.infer<typeof CampaignRowSchema>;

export const CampaignDetailSchema = CampaignRowSchema.extend({
  body: z.string(),
  imageAssetId: z.uuid().nullable(),
  imageUrl: z.string().nullable(),
  linkUrl: z.string().nullable(),
  audience: AudienceSchema,
  pacing: PacingViewSchema,
  sentToday: z.number().int(),
  /** Minutes of wall clock the remaining recipients are expected to take. */
  estimateMinutes: z.number().int(),
  /** Rendered for the first pending recipient — what the next person sees. */
  preview: z.string(),
});
export type CampaignDetail = z.infer<typeof CampaignDetailSchema>;

export const RecipientRowSchema = z.object({
  id: z.uuid(),
  phone: z.string(),
  name: z.string().nullable(),
  userId: z.string().nullable(),
  status: z.enum(RECIPIENT_STATUSES),
  attempts: z.number().int(),
  sentAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
});
export type RecipientRow = z.infer<typeof RecipientRowSchema>;

/** What the audience picker shows before anything is created. */
export const AudiencePreviewSchema = z.object({
  /** Distinct, opted-in, reachable numbers — the number that will be queued. */
  recipients: z.number().int(),
  /** Numbers dropped because the platform has no valid E.164 for them. */
  unreachable: z.number().int(),
  /** Numbers dropped because somebody replied «قف». */
  optedOut: z.number().int(),
  estimateMinutes: z.number().int(),
});
export type AudiencePreview = z.infer<typeof AudiencePreviewSchema>;

/** The sender device, as the API reports it. */
export const WHATSAPP_DEVICE_STATES = [
  'disabled',
  'unreachable',
  'disconnected',
  'linking',
  'connected',
] as const;
export type WhatsappDeviceState = (typeof WHATSAPP_DEVICE_STATES)[number];

export const WhatsappDeviceSchema = z.object({
  state: z.enum(WHATSAPP_DEVICE_STATES),
  /** E.164 of the linked number, once there is one. */
  phone: z.string().nullable(),
  /** A `data:image/png;base64,…` QR, present only while `state` is linking. */
  qr: z.string().nullable(),
  /** Free text for the operator when `state` is `unreachable`. */
  detail: z.string().nullable(),
});
export type WhatsappDevice = z.infer<typeof WhatsappDeviceSchema>;

export const OptOutRowSchema = z.object({
  phone: z.string(),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type OptOutRow = z.infer<typeof OptOutRowSchema>;
