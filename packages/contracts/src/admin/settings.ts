import { z } from '@ayman/contracts/zod';
import { BookShippingRatesSchema } from '@ayman/contracts/books';
import { SocialCountsSchema } from '@ayman/contracts/admin/social-counts';

/**
 * TOKEN SLOTS, not colours. The admin picks one of these; the mapping from a
 * slot to actual OKLCH values lives in `packages/ui` and is never editable.
 * An editor can therefore never type raw CSS (Global Constraint 18 / A12).
 *
 * There is deliberately no `green` and no `red`: those two hues are
 * load-bearing for quiz correctness and must never become the brand.
 */
export const ACCENT_SLOTS = ['amber', 'cyan', 'blue', 'violet', 'magenta', 'slate'] as const;
export const AccentSlotSchema = z.enum(ACCENT_SLOTS);
export type AccentSlot = z.infer<typeof AccentSlotSchema>;

/**
 * Hues a brand may never take, because they already mean something.
 *
 * `--ok` is hue 150 and `--err` is 25, and they are how a student is told
 * whether an answer was right. The docblock on `ACCENT_SLOTS` above has always
 * said green and red can never be the brand; with a free hue that stops being
 * a matter of which six values got listed and has to be enforced.
 *
 * ±20° each, which is wide enough that "nearly the correct-answer green" is
 * also out. Amber (72) and blue (258) sit outside both bands, so the six
 * shipped slots are unaffected — as does `--warn` at 85 and `--info` at 245,
 * which are close to two of them and deliberately tolerated: a warning banner
 * looking brand-adjacent costs nothing, a wrong answer looking correct does.
 */
export const RESERVED_HUES = [
  { center: 150, meaning: 'إجابة صح' },
  { center: 25, meaning: 'إجابة غلط' },
] as const;

export const RESERVED_HUE_RADIUS = 20;

/** Angular distance between two hues, 0–180. */
function hueDistance(a: number, b: number): number {
  const raw = Math.abs(((a - b) % 360) + 360) % 360;
  return raw > 180 ? 360 - raw : raw;
}

export function reservedHueConflict(hue: number): string | null {
  for (const { center, meaning } of RESERVED_HUES) {
    if (hueDistance(hue, center) <= RESERVED_HUE_RADIUS) return meaning;
  }
  return null;
}

/**
 * A tenant's own brand hue, which OVERRIDES `accent` when set.
 *
 * A NUMBER, not a colour string — the editor still never types CSS (Global
 * Constraint 18 / A12). The server turns this into the whole scheme through
 * `generateRamps` in `@ayman/ui`, which solves each step for its contrast
 * target and clamps every value into sRGB.
 *
 * `null` means "use the `accent` slot", which is what every existing row says
 * and what Ayman's platform keeps saying — his amber is hand-tuned and is not
 * regenerated.
 */
export const AccentHueSchema = z
  .number()
  .int()
  .min(0)
  .max(359)
  .nullable()
  .default(null)
  .refine((hue) => hue === null || reservedHueConflict(hue) === null, {
    message: 'اللون ده قريب أوي من لون «إجابة صح» أو «إجابة غلط» — اختار درجة تانية',
  });

/**
 * The landing page's SHAPE — a different page, not the same page recoloured.
 *
 * ## Why this exists and the colour setting was not enough
 *
 * `accentHue` changes what the page is coloured. It does not change the page:
 * every instructor still gets the same full-bleed dark hero at `100svh`, the
 * same two-column copy grid, the same card rhythm — Ayman's page, tinted. Two
 * instructors sharing a market and a curriculum end up with two sites that are
 * recognisably one site, which is the opposite of what a separate brand is for.
 *
 * ## Why a page-level enum and not a variant on every block
 *
 * A `variant` prop on each of the twelve block types would be twelve decisions
 * per tenant and twelve components to keep in step. This is ONE decision that
 * moves the whole page, because what actually distinguishes these looks is not
 * any single section — it is the rhythm they share: how tall the opener is,
 * whether headings sit centred or ranged, whether content sits in cards or
 * between rules, how much air runs between sections.
 *
 * So the value lands as `data-layout` on the page's `<main>` and the section
 * stylesheets answer it. No block changes, no component takes a new prop, and
 * a tenant switches their whole page in one save.
 *
 *   · `classic`   — what the platform ships: a full-height dark stage, the
 *                   copy ranged right over it, content in raised cards. This
 *                   is Ayman's page and stays the default, so no stored row
 *                   changes meaning.
 *   · `editorial` — no dark stage. A light opener sized to its own content,
 *                   one centred column, much larger headings, and sections
 *                   separated by hairlines instead of cards. Reads like a
 *                   long-form page rather than a product site.
 *   · `compact`   — a short opener, centred copy, tighter type and denser
 *                   sections with bordered cards. Reads like an app's
 *                   marketing page: more on the first screen, less air.
 *
 * ## How this relates to `landingPreset` below, and why BOTH exist
 *
 * They answer different questions and the answers compose:
 * `landingPreset` chooses WHICH page component runs; this chooses the rhythm
 * of the sections INSIDE `classic`. `app/(site)/page.tsx` branches on the
 * preset FIRST, and only the `classic` branch ever reaches the
 * `<main data-layout={…}>` these rules hang off — so this setting is inert on
 * `neon` and `board` by construction, not by a convention someone has to
 * remember to honour when they write the next preset.
 *
 * Neither field subsumes the other. Folding the presets in here as three more
 * enum values would have made `editorial` and `neon` alternatives to each
 * other, and they are not: `editorial` is a way of arranging Ayman's twelve
 * sections, `neon` is a page that does not contain them.
 */
export const LANDING_LAYOUTS = ['classic', 'editorial', 'compact'] as const;
export const LandingLayoutSchema = z.enum(LANDING_LAYOUTS);

/**
 * Whether the opener's portrait drifts once it has arrived.
 *
 * `still` is the default and what every stored row means, because the
 * `studio` opener was designed still on purpose (`presets.css`, the caret
 * note: an indefinite motion on an otherwise still page is a thing the eye
 * keeps returning to). `float` exists for the teacher whose portrait is a
 * cut-out composition — a figure, a crown, a wordmark — where a slow drift
 * reads as the picture being alive rather than as a page that will not settle.
 *
 * Off unless a teacher turns it on, so switching it on for one stack cannot
 * change another stack's page.
 */
export const PORTRAIT_MOTIONS = ['still', 'float'] as const;
export const PortraitMotionSchema = z.enum(PORTRAIT_MOTIONS);
export type LandingLayout = z.infer<typeof LandingLayoutSchema>;

/**
 * WHICH landing page renders — a different page, not the same page reshaped.
 *
 * ## Why `landingLayout` above was not enough, in the words of the people who
 * ## were handed it
 *
 * `landingLayout` is a CSS override: one attribute on the same `<main>`, the
 * same twelve block components in the same order, the same DOM. It moves the
 * rhythm — opener height, ranged vs centred, cards vs hairlines — and that is
 * genuinely a different page to LOOK at. It is not a different page to
 * RECOGNISE. Stand `classic`, `editorial` and `compact` next to each other
 * with three different hues on them and the shared skeleton still shows
 * through: the same eyebrow over the same rotating headline over the same stat
 * row, the same three-up course grid, the same accordion at the bottom. The
 * instructors said the quiet part out loud — a recoloured, reshaped version of
 * the same page is still recognisably the same site, and a site that is
 * recognisably somebody else's is not a brand.
 *
 * ## `classic` is the default, and that is load-bearing, not tidy
 *
 * Every `site_settings.data.branding` row in existence was written before this
 * field did, so none of them carries a `landingPreset` key and all of them
 * parse to `classic` — which reaches the exact component tree
 * `app/(site)/page.tsx` renders today, through the exact same code path. A
 * default of anything else would have swapped Ayman's live landing page — the
 * one with real students and real money on it — on the first deploy, silently,
 * with nobody having touched a setting. `.strict()` on `BrandingSchema` means
 * the new key cannot arrive from anywhere except a save that meant it.
 *
 *   · `classic` — what the platform ships and what every stored row means.
 *                 `page.tsx` falls through to the return statement it has
 *                 today and `landingLayout` does its work inside it.
 *   · `neon`    — «الترمينال». A page that never turns light: it ignores
 *                 `data-theme` on purpose, so there is no light variant to
 *                 design and no pale flash on the way into one.
 *   · `board`   — «اللوح». Solid colour blocks, everything centred, bright —
 *                 closer to a poster than to a product site.
 *   · `studio`  — «الاستوديو». Light ground, the instructor's own photograph
 *                 at full height in the opener, and one dark band on the
 *                 whole page spent on enrolling. Mono type appears only where
 *                 there is real code.
 *
 * ## Why `studio` exists when `neon` was already the programming one
 *
 * `neon` dresses the page as a terminal — `$`, a caret, `about.md`, mono
 * labels on every section. That is a senior developer's aesthetic, and the
 * page it sits on is selling a first programming course to fifteen-year-olds
 * whose headline promise is «البرمجة أسهل ما تتخيّل». The chrome argued
 * against the copy: it says «this is a world you are not in yet» to exactly
 * the reader who needs to be told the opposite.
 *
 * It is also dark, and so is `classic`'s opener, and `board` is a solid
 * colour field. Three instructors sharing one market had three pages that all
 * read as low-light. `studio` is the one that is not.
 *
 * The three alternates live in their own page components under
 * `apps/web/components/site/presets/`, imported ONLY inside their own branch,
 * so choosing `classic` neither loads nor evaluates a byte of any of them.
 */
export const LANDING_PRESETS = ['classic', 'neon', 'board', 'studio', 'ruqaa', 'kurrasa', 'taif', 'sabboora', 'rihla', 'nujoom'] as const;
export const LandingPresetSchema = z.enum(LANDING_PRESETS);
export type LandingPreset = z.infer<typeof LandingPresetSchema>;

/** Radius presets. Every preset keeps the card ceiling at ≤ 8px. */
export const RADIUS_SLOTS = ['sharp', 'default', 'soft'] as const;
export const RadiusSlotSchema = z.enum(RADIUS_SLOTS);
export type RadiusSlot = z.infer<typeof RadiusSlotSchema>;

/** Media is referenced by asset id, never by URL. */
const assetId = z.uuid().nullable().default(null);

export const BrandingSchema = z
  .object({
    accent: AccentSlotSchema.default('amber'),
    /** Overrides `accent` when set. See `AccentHueSchema`. */
    accentHue: AccentHueSchema,
    /**
     * WHICH landing page. See `LandingPresetSchema` — and note that it is
     * read BEFORE `landingLayout`: on `neon` and `board` the field below is
     * never consulted at all.
     */
    landingPreset: LandingPresetSchema.default('classic'),
    /** The shape of the `classic` page. See `LandingLayoutSchema`. */
    landingLayout: LandingLayoutSchema.default('classic'),
    /** The opener portrait's idle motion. See `PortraitMotionSchema`. */
    portraitMotion: PortraitMotionSchema.default('still'),
    radius: RadiusSlotSchema.default('default'),
    logoLightAssetId: assetId,
    logoDarkAssetId: assetId,
    faviconAssetId: assetId,

    /*
     * صور المدرّس نفسه — غير الشعار.
     *
     * `MediaSlot` بيقرا من `brandAssets` وهي ملفات مكتوبة في الكود ومتجيّتة
     * بـ`aymanOnly`. فأي مدرّس تاني بياخد **رسمة بديلة** في المقدمة وفي قسم
     * «المدرّس» وفي صفحة الدخول، مهما رفع صور في مكتبته.
     *
     * والحل مش إننا نحط صورته في `logoLightAssetId`: الخانة دي صندوق ٣:١
     * للشعار، وصورة شخص جوّاها بتبان مربع صغير مش مقروء — اتجرّبت على منصة
     * صبري وده اللي ظهر بالظبط.
     *
     * فكل خانة ليها حقلها: المقدمة عريضة (3:2)، والبورتريه طويل (3:4)،
     * وصفحة الدخول عمود جنبي. المدرّس بيرفع في مكتبته ويختار، زي الشعار.
     */
    heroAssetId: assetId,
    portraitAssetId: assetId,
    loginAssetId: assetId,

    /*
     * Every other picture on the platform, and a dark-mode file for each.
     *
     * Until these existed, the round avatar in the top bar, the three year
     * posters, the honour-board host and the practice guide were files in
     * `apps/web/public/brand/`, reachable on Ayman's stack only and changeable
     * only by a deploy. Each is now a slot here, and an upload WINS over the
     * file — the same order `<MediaSlot>` already used for the hero.
     *
     * The `…Dark…` fields are optional overrides: null means «same picture in
     * both modes», which is what every stored row means today. The list of
     * slots, which pair goes with which, and what each one is called on the
     * admin form all live in `brand-images.ts` so the form, the API resolver
     * and the renderers cannot drift apart.
     *
     * `logoLight/DarkAssetId` above are already a pair and stay as they are.
     */
    markAssetId: assetId,
    markDarkAssetId: assetId,
    faviconDarkAssetId: assetId,
    heroDarkAssetId: assetId,
    portraitDarkAssetId: assetId,
    loginDarkAssetId: assetId,
    trackEssentialsAssetId: assetId,
    trackEssentialsDarkAssetId: assetId,
    trackYear1AssetId: assetId,
    trackYear1DarkAssetId: assetId,
    trackYear2AssetId: assetId,
    trackYear2DarkAssetId: assetId,
    honorHostAssetId: assetId,
    honorHostDarkAssetId: assetId,
    practiceGuideAssetId: assetId,
    practiceGuideDarkAssetId: assetId,
    /*
     * The teacher's signature, drawn on both certificates in place of the
     * name set in a script face. Light = dark ink for the ivory exam
     * certificate; dark = light ink for the black unit certificate. Each
     * falls back to the other, then to the typeset name.
     */
    signatureAssetId: assetId,
    signatureDarkAssetId: assetId,
    /*
     * A photograph laid UNDER every coverless course's generated artwork,
     * tinted by that course's subject hue — so courses without a cover gain
     * a real picture and still do not all look the same. A course's own
     * cover always wins.
     */
    courseCoverAssetId: assetId,
    courseCoverDarkAssetId: assetId,
    /** The home-screen icon (PWA manifest + apple-touch-icon). One file: a launcher has no theme. */
    appIconAssetId: assetId,
  })
  .strict();

export type Branding = z.infer<typeof BrandingSchema>;

export const SeoSchema = z
  .object({
    titleAr: z.string().max(70).default(''),
    descriptionAr: z.string().max(160).default(''),
    ogImageAssetId: assetId,
    /*
     * A share image per public section, over `ogImageAssetId` above. Which
     * path each one covers lives in `OG_PAGES` (`seo-pages.ts`); a page that
     * passes its own image (a course cover, a news photo) still wins.
     */
    ogCoursesAssetId: assetId,
    ogBooksAssetId: assetId,
    ogAboutAssetId: assetId,
    ogHonorBoardAssetId: assetId,
    ogPracticeAssetId: assetId,
    ogNewsAssetId: assetId,
    ogLinksAssetId: assetId,
    ogSubscribeAssetId: assetId,
  })
  .strict();

export type Seo = z.infer<typeof SeoSchema>;

/**
 * A storage KEY resolved by the API from the asset id beside it.
 *
 * ⚠️ Read-only, and that is the whole point of the separate `*ReadSchema`
 * types below rather than three more fields on the write schemas.
 * `updateSection()` persists whatever the section schema accepts, so a key on
 * `BrandingSchema` would be STORED — and a stored key is a second copy of a
 * fact that already lives in `media_assets.storage_key`, free to go stale the
 * moment an asset's bytes are re-cropped to a new key. `SECTION_SCHEMAS` is
 * deliberately built from the write schemas only.
 */
const resolvedKey = z.string().nullable().default(null);

/**
 * What `GET /api/settings/branding` returns: the stored branding PLUS the
 * storage key of each asset it points at.
 *
 * This exists because the root layout has an asset id and needs a URL, and
 * the two are NOT interconvertible. `mediaUrl()` takes a storage key —
 * `<2 hex>/<uuid>.webp`, the shape `GET /media/:prefix/:name` routes on — and
 * the layout was passing `` `${faviconAssetId}.webp` ``, a single path segment
 * that matches no route. Every favicon an admin has ever chosen 404'd, and
 * silently: a broken `<link rel="icon">` leaves the browser's default globe in
 * the tab, which looks exactly like "not set yet".
 *
 * Resolving server-side rather than deriving the key in the client also keeps
 * `storage_key` free to change for a stable asset id — which is what
 * re-cropping an existing asset does, so that the old URL stays immutable and
 * cacheable instead of being overwritten under a year-long `Cache-Control`.
 */
export const BrandingReadSchema = BrandingSchema.extend({
  logoLightKey: resolvedKey,
  logoDarkKey: resolvedKey,
  faviconKey: resolvedKey,
  heroKey: resolvedKey,
  portraitKey: resolvedKey,
  loginKey: resolvedKey,
  markKey: resolvedKey,
  markDarkKey: resolvedKey,
  faviconDarkKey: resolvedKey,
  heroDarkKey: resolvedKey,
  portraitDarkKey: resolvedKey,
  loginDarkKey: resolvedKey,
  trackEssentialsKey: resolvedKey,
  trackEssentialsDarkKey: resolvedKey,
  trackYear1Key: resolvedKey,
  trackYear1DarkKey: resolvedKey,
  trackYear2Key: resolvedKey,
  trackYear2DarkKey: resolvedKey,
  honorHostKey: resolvedKey,
  honorHostDarkKey: resolvedKey,
  practiceGuideKey: resolvedKey,
  practiceGuideDarkKey: resolvedKey,
  signatureKey: resolvedKey,
  signatureDarkKey: resolvedKey,
  courseCoverKey: resolvedKey,
  courseCoverDarkKey: resolvedKey,
  appIconKey: resolvedKey,
});

export type BrandingRead = z.infer<typeof BrandingReadSchema>;

/** Same resolution, for the OG image `buildMetadata()` renders. */
export const SeoReadSchema = SeoSchema.extend({
  ogImageKey: resolvedKey,
  ogCoursesKey: resolvedKey,
  ogBooksKey: resolvedKey,
  ogAboutKey: resolvedKey,
  ogHonorBoardKey: resolvedKey,
  ogPracticeKey: resolvedKey,
  ogNewsKey: resolvedKey,
  ogLinksKey: resolvedKey,
  ogSubscribeKey: resolvedKey,
});

export type SeoRead = z.infer<typeof SeoReadSchema>;

/**
 * `https` only. An `http://` link in the footer is a mixed-content warning on
 * every page that renders it, and there is no legitimate reason for one.
 */
const optionalUrl = z
  .url()
  .refine((value) => value.startsWith('https://'), { message: 'must be an https:// URL' })
  .nullable()
  .default(null);

/** E.164, same convention as `student_profiles.phone`. */
const optionalPhone = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/)
  .nullable()
  .default(null);

/**
 * ⚠️ Every channel the SITE FOOTER renders has to be representable here, or it
 * is not editable from the dashboard — and what is not editable ends up
 * hardcoded in `components/site/site-footer.tsx`, which is where the real
 * profiles lived until this schema grew to hold them.
 *
 * Two of those hardcoded links were bare platform roots — `https://wa.me/` and
 * `https://www.facebook.com/groups/` — so the WhatsApp button and the
 * community link in the footer sent every student to WhatsApp's and
 * Facebook's own landing pages. `instagram` and `tiktok` are here for the
 * opposite reason: the profiles were correct but unreachable from the
 * dashboard, so a change of handle meant a code deploy.
 *
 * `whatsappChannel` and `whatsapp` are different things and both are kept: the
 * first is a broadcast channel URL, the second is the NUMBER the footer's
 * «كلّمنا» button turns into a `wa.me` link.
 */
export const ContactSchema = z
  .object({
    email: z.email().nullable().default(null),
    phone: optionalPhone,
    whatsapp: optionalPhone,
    facebook: optionalUrl,
    youtube: optionalUrl,
    telegram: optionalUrl,
    instagram: optionalUrl,
    tiktok: optionalUrl,
    whatsappChannel: optionalUrl,
    /**
     * The student GROUP, which is a third thing again — see the note above on
     * `whatsappChannel` vs `whatsapp`.
     *
     * A channel broadcasts and nobody can answer in it; the group is where
     * students talk to each other and to him. «رسايل م. أيمن» invites students
     * into THIS one, and deliberately does not fall back to the channel when it
     * is empty: a message that says «جروب الواتساب مستنيك» over a link to a
     * read-only channel is a promise the link cannot keep. Empty means the
     * invitation is simply not sent.
     */
    whatsappGroup: optionalUrl,
    facebookGroup: optionalUrl,
    /**
     * The number the subscribe flow shows a student to transfer to —
     * `PaymentsService` never reads this, it is display-only, exactly the
     * "here's the door" role `whatsappChannel` already plays. Public: it has
     * to be, the subscribe panel renders before a student has any session,
     * same as every other contact field on this object.
     *
     * ⚠️ ALIVE AGAIN as of 2026-09-14, after a spell as a dead key.
     *
     * It was superseded by `instapay` when InstaPay became the only
     * destination. Checkout now ASKS which rail the student wants — إنستاباي
     * or فودافون كاش — so this is a real payment destination once more, and
     * the wallet number is genuinely a different number from the InstaPay one.
     *
     * ⚠️ The two must never be conflated or defaulted into each other. A
     * student who picks «فودافون كاش» and is shown the InstaPay number sends
     * money to a rail the screen is not describing, and nothing reconciles it.
     * Empty here means the Vodafone Cash choice is offered as unavailable —
     * which is a fixable admin gap. A wrong number is not fixable.
     *
     * Note for anyone tempted to delete it in a future cleanup: this object is
     * `.strict()` and a row carrying this key is stored in production's
     * `site_settings.data`, so removing the field makes the stored row fail to
     * parse — and `SettingsService.read()` feeds the root layout, so every page
     * on the site 500s at once.
     */
    vodafoneCash: optionalPhone,
    /**
     * The InstaPay number students transfer to — the live payment
     * destination for BOTH course subscriptions and book orders.
     *
     * Deliberately a NEW key rather than a rename of `vodafoneCash` above,
     * for the reason spelled out there. And deliberately no fallback to it
     * anywhere in the read path: the panel that renders this number is
     * labelled «إنستاباي», and falling back to the old Vodafone number would
     * put a wallet number under an InstaPay heading — students would send
     * money to a destination the screen is not describing. Empty here means
     * the panel says the payment number is not set up yet, which is a
     * fixable admin gap; a wrong number is not.
     */
    instapay: optionalPhone,
  })
  .strict();

export type Contact = z.infer<typeof ContactSchema>;

/**
 * «رسايل م. أيمن» — which of the four messages the platform may send in his
 * name, and how patient each one is.
 *
 * ## Why every kind has its own switch
 *
 * Because they are not the same promise. `quiz_result` reacts to something the
 * student just did and is nearly always welcome; `whatsapp_invite` arrives
 * unprompted and is the first one anybody would want to turn off. One master
 * switch would mean losing the useful three to silence the intrusive one.
 *
 * ## Why the timings are settings and not constants
 *
 * `nudgeAfterHours` is the difference between a teacher who noticed and a
 * teacher who is nagging, and where that line falls is his judgement about his
 * own students — not a number a developer should be choosing in a file.
 */
/**
 * «نتيجة الامتحان تتبعت لمين» — who hears about a graded paper.
 *
 *   · `student`  — the chat message in the student's own thread. What the
 *     platform has always done, and the default, so a stored row that predates
 *     this key (and every stack that never opens the screen) changes nothing.
 *   · `guardian` — a WhatsApp message to the guardian's number INSTEAD. A
 *     student with no usable guardian number still gets their own message:
 *     telling nobody is never what this switch means.
 *   · `both`     — the two of them.
 *
 * The guardian leg goes out from the linked WhatsApp device, so it only exists
 * where the stack holds `outreach.whatsapp` and `marketing.whatsapp`. Anywhere
 * else the value is read as `student` (`resultRoute` in
 * `outreach/guardian-result.ts`), so a stored `guardian` can never silence a
 * stack that has no way to reach a parent.
 */
export const QUIZ_RESULT_RECIPIENTS = ['student', 'guardian', 'both'] as const;
export type QuizResultRecipient = (typeof QUIZ_RESULT_RECIPIENTS)[number];

export const OutreachSettingsSchema = z
  .object({
    quizResult: z.boolean().default(true),
    /** See `QUIZ_RESULT_RECIPIENTS`. A NEW key with a default — safe on a stored row. */
    quizResultTo: z.enum(QUIZ_RESULT_RECIPIENTS).default('student'),
    quizNudge: z.boolean().default(true),
    lessonPraise: z.boolean().default(true),
    whatsappInvite: z.boolean().default(true),
    /**
     * How long a finished lesson may sit with its quiz untouched before the
     * nudge goes out. Floor of 1 hour, because anything shorter reaches a
     * student who is still on the page.
     */
    nudgeAfterHours: z.number().int().min(1).max(720).default(24),
    /**
     * Days before the same student may be reminded about the channel again.
     *
     * ⚠️ The KEY still says «group» and must not be renamed. `OutreachSettings`
     * is `.strict()` and this object is already stored in production's
     * `site_settings.data`; renaming the key would make the stored row fail to
     * parse, and `SettingsService.read()` feeds the root layout — so every page
     * on the site would 500 at once. The destination changed from the group to
     * the channel; the column name is stuck, and a comment is cheaper than an
     * outage.
     */
    groupInviteEveryDays: z.number().int().min(3).max(365).default(21),
    /**
     * How many times ONE student may ever be asked, across their whole life on
     * the platform.
     *
     * The pacing above only says how far apart the asks are, so on its own it
     * means a student who never presses gets a dozen invitations over a school
     * year. At some point "he keeps reminding me" turns into "he does not
     * listen" — and anyone who DOES press stops being asked immediately
     * regardless, through `student_profiles.whatsapp_opened_at`.
     *
     * Safe to add to a schema that is already stored: every field here carries
     * a `.default()`, so a row written before this key existed parses with it
     * filled in. Adding keys is fine; renaming them is the outage above.
     */
    maxInvitesPerStudent: z.number().int().min(1).max(20).default(4),
    /**
     * The ceiling on outreach per student per day, across ALL kinds.
     *
     * The sweeper can legitimately find a student who finished four lessons in
     * one evening, and four separate messages from «أيمن» in one hour is not
     * attentiveness, it is a mailing list. This is the last line of defence and
     * it is enforced in the delivery path, not in each sweep.
     */
    maxPerStudentPerDay: z.number().int().min(1).max(10).default(2),
    /*
     * ── The two AUTOMATIC WhatsApp kinds ─────────────────────────────────
     *
     * Read only where the `outreach.whatsapp` entitlement is on — which is
     * what keeps a default of `true` here from switching anything on for a
     * teacher who never asked: on their stack the sweeper never runs and the
     * screen never draws these rows. On Ayman's it means the messages start
     * by themselves the moment a device is linked, which is what he asked for.
     *
     * Every one is a NEW key with a `.default()`, so a stored row written
     * before this existed parses with them filled in (see the note on
     * `maxInvitesPerStudent` for why adding is safe and renaming is not).
     */
    /** «كمّل الدفع» — one reminder after a payment step was left open. */
    checkoutRecovery: z.boolean().default(true),
    /**
     * How long an opened payment step may sit before the reminder. Floor of
     * one hour: anything shorter reaches a student still on the page, or one
     * whose transfer is simply taking a while to send.
     */
    checkoutRecoveryAfterHours: z.number().int().min(1).max(47).default(3),
    /** Days before the SAME course or order may be reminded about again. */
    checkoutRecoveryEveryDays: z.number().int().min(1).max(60).default(7),
    /** «الحساب جاهز» — to an account that has bought nothing. */
    signupNudge: z.boolean().default(true),
    /** Hours after sign-up before the first nudge. */
    signupNudgeAfterHours: z.number().int().min(1).max(144).default(24),
    /**
     * Days after the FIRST nudge before the second. `0` turns the second one
     * off — one number rather than a switch and a number, because a second
     * nudge with no delay is not a thing anybody would want.
     */
    signupNudgeSecondAfterDays: z.number().int().min(0).max(30).default(4),
    /**
     * The ceiling on these automatic WhatsApp messages per Cairo day, across
     * both kinds. Deliberately far under a campaign's 200: they go out from
     * the same number with nobody watching, and a freshly linked number is
     * exactly the one WhatsApp is quickest to restrict.
     */
    autoWhatsappDailyCap: z.number().int().min(1).max(200).default(30),
  })
  .strict();

export type OutreachSettings = z.infer<typeof OutreachSettingsSchema>;

/**
 * «الكتب» — the one number about the shop that must move without a deploy.
 *
 * Delivery is quoted per ORDER, once, no matter how many books are in it, and
 * the courier's price changes. Keeping it here rather than as a constant means
 * raising it is a form field; keeping the CHARGED amount frozen on each
 * `book_orders.shipping_cents` row means raising it never rewrites what an old
 * order says it cost. Those two facts are what make a settings row the right
 * home for it rather than either extreme.
 *
 * ⚠️ NOT on `PublicSettingsSchema`, unlike `contact`. The public catalogue
 * response carries the fee itself (see `BookCatalogSchema`) — the cart needs it
 * on the first render, and adding a required key to the settings payload every
 * page on the site parses is a blast radius this does not need.
 *
 * Capped at 500 EGP because a delivery fee above that is a typed extra zero,
 * and the failure mode of the typo is a cart nobody completes.
 */
export const StoreSettingsSchema = z
  .object({
    /**
     * ⚠️ LEGACY — the old FLAT fee. Parsed and IGNORED.
     *
     * Delivery is priced per zone now (`shippingRates` below). This key is kept
     * because a settings row already written on production carries it and this
     * schema is `.strict()`: removing the field would make every settings read
     * on the live row throw, which on this platform is the whole site rather
     * than one screen. See `BOOK_SHIPPING_CENTS`.
     */
    shippingCents: z.number().int().min(0).max(50_000).default(6_500),
    /**
     * «قاهرة وجيزة ٨٠، وجه بحري ١٠٠، صعيد وسينا وبحر أحمر ١٥٠» — the three
     * rates, editable without a deploy for exactly the reason the single fee
     * was: the courier's price moves and a deploy is the wrong unit of work
     * for it.
     *
     * `.prefault({})` and not `.default({})` — see `SiteSettingsSchema`'s own
     * note. With `.default({})` a never-written key would read as a literal
     * `{}` typed as `BookShippingRates`, i.e. three `undefined` fees, and the
     * cart would quote `NaN`.
     */
    shippingRates: BookShippingRatesSchema.prefault({}),
    /**
     * What ONE parcel actually costs the owner at the courier — «الشحن كله
     * ١٠٠» — whatever zone fee the student was charged.
     *
     * The zone fees above are what the STUDENT pays (٨٠ / ١٠٠ / ١٥٠), and the
     * early orders had delivery folded into a ٢٥٠ cover price with no fee at
     * all. Treating the collected fee as a pass-through therefore got «مكسب
     * الكتب» wrong both ways. With this set, the profit is everything a book
     * order brought in, minus the copies, minus this per parcel.
     *
     * NULL is «مش متحدد» and keeps the old pass-through reading, never «ببلاش».
     */
    courierCostCents: z.number().int().min(0).max(50_000).nullable().default(null),
  })
  .strict();

export type StoreSettings = z.infer<typeof StoreSettingsSchema>;

/**
 * ⚠️ `.prefault({})`, never `.default({})`.
 *
 * Zod 4 changed `.default()` to short-circuit: the given value is returned
 * as-is, WITHOUT running the inner schema. `BrandingSchema.default({})` would
 * therefore make `SiteSettingsSchema.parse({}).branding` a literal `{}` —
 * typed as `Branding`, `undefined` at every property, and the whole reason
 * jsonb is acceptable here (a never-written key reads as its default) would be
 * quietly false. `.prefault()` is Zod 4's spelling of the old behaviour: the
 * value is fed THROUGH the schema.
 */
/**
 * «المدرّس» — القسم اللي بيعرّف الطالب على اللي بيشرح له.
 *
 * ## ليه ده بقى إعداد بدل كوبي
 *
 * الكوبي في `ar.ts` بتقول حقايق عن شخص بعينه: «مهندس شغّال في السوق من ٨
 * سنين»، «اتخرّج من MTI»، «كان instructor في GDG». دي كانت بتترسم على دومين
 * كل مدرّس كأنها بتاعته — مش تسريب شكل، **ادّعاءات غلط منسوبة ليه**. اتجيّتت
 * خلف `aymanOnly()`، والنتيجة إن ستاك المدرّس التاني بقى عنده عنوان من غير
 * سيرة.
 *
 * فالسيرة نزلت للداتابيز: كل مدرّس بيكتب بتاعته من لوحته. وستاك أيمن بيسقط
 * على الكوبي المكتوبة زي ما هي، فما اتغيّرش عنده ولا بايت.
 *
 * ## الشهادات مش نص حر
 *
 * `credits` ليستة أسطر قصيرة، كل واحد سؤال وإجابة («درس فين؟» → «حاسبات
 * بنها»). الشكل ده هو اللي بيعدّي في `llms.txt` كإجابة مفهومة للوكلاء، وهو
 * كمان اللي بيمنع المدرّس يحط فقرة طويلة في مكان مصمّم لسطر.
 */
export const AboutSettingsSchema = z
  .object({
    /** الفقرة الأساسية — مين هو وبيشرح إيه. */
    bioAr: z.string().trim().max(600).default(''),
    /**
     * سطور الشهادات. أقصى ٦: القايمة دي بتترسم كتايلات جنب بعض، وفوق كده
     * بتلف لسطر تالت وتاكل الصفحة على الموبايل.
     */
    credits: z
      .array(
        z.object({
          labelAr: z.string().trim().min(1).max(60),
          noteAr: z.string().trim().min(1).max(200),
        }),
      )
      .max(6)
      .default([]),
  })
  .strict();

export type AboutSettings = z.infer<typeof AboutSettingsSchema>;

export const SiteSettingsSchema = z
  .object({
    branding: BrandingSchema.prefault({}),
    seo: SeoSchema.prefault({}),
    contact: ContactSchema.prefault({}),
    outreach: OutreachSettingsSchema.prefault({}),
    store: StoreSettingsSchema.prefault({}),
    about: AboutSettingsSchema.prefault({}),
    /** «عدد السوشيال ميديا» — see `admin/social-counts.ts`, and why it is
     *  stored here but is NOT one of `SETTINGS_SECTIONS`. */
    socialCounts: SocialCountsSchema.prefault({}),
  })
  .strict();

export type SiteSettings = z.infer<typeof SiteSettingsSchema>;

/** What the public site is allowed to read. Branding has its own endpoint. */
/*
 * `about` هنا مقصود: القسم بيترسم على الصفحة الرئيسية وصفحة «عن المدرّس»،
 * والاتنين عامّين. الفرق بينه وبين `store` (اللي **مش** هنا) إن ده كلام
 * المفروض أي حد يقراه، مش إعداد تشغيلي.
 */
export const PublicSettingsSchema = z
  .object({ seo: SeoSchema, contact: ContactSchema, about: AboutSettingsSchema.prefault({}) })
  .strict();

export type PublicSettings = z.infer<typeof PublicSettingsSchema>;

/** The same payload as returned over the wire, with the OG image key resolved. */
export const PublicSettingsReadSchema = z
  .object({ seo: SeoReadSchema, contact: ContactSchema, about: AboutSettingsSchema.prefault({}) })
  .strict();

export type PublicSettingsRead = z.infer<typeof PublicSettingsReadSchema>;

export const SETTINGS_SECTIONS = ['branding', 'seo', 'contact', 'outreach', 'store', 'about'] as const;
export const SettingsSectionSchema = z.enum(SETTINGS_SECTIONS);
export type SettingsSection = z.infer<typeof SettingsSectionSchema>;

/** One schema per section, so `PATCH /admin/settings/:section` stays typed. */
export const SECTION_SCHEMAS = {
  branding: BrandingSchema,
  seo: SeoSchema,
  contact: ContactSchema,
  /**
   * ⚠️ NOT on `PublicSettingsSchema`, and that is deliberate. How often the
   * platform nudges, and after how many hours, is operational detail about how
   * students are handled — the public site has no use for it and every reason
   * not to publish it.
   */
  outreach: OutreachSettingsSchema,
  /**
   * ⚠️ Also NOT on `PublicSettingsSchema` — for a different reason from
   * `outreach` above. The delivery fee is not a secret; it is on the cart. It
   * stays off that payload because the catalogue response already carries it,
   * and one number with two sources is one number that will eventually
   * disagree with itself.
   */
  store: StoreSettingsSchema,
  about: AboutSettingsSchema,
} as const;
