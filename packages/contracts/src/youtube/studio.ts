import { z } from '@ayman/contracts/zod';

/**
 * «يوتيوب» — the teacher's own YouTube channel, connected once through
 * Google OAuth, and the SEO of its videos edited from the platform.
 *
 * ## What crosses the wire, and what never does
 *
 * The refresh token is sealed in `app.youtube_connection` and opened only on
 * its way to Google (`youtube-connection.service.ts`). Nothing below carries
 * it: the browser sees the channel's public face and the token's last four
 * characters, the same shape the social studio's Page token has.
 *
 * ## Quota
 *
 * The YouTube Data API gives a project 10,000 units a day. A list page costs
 * 2 (playlistItems + videos), a save 50, a thumbnail 50, and «اقترح لي» up to
 * 250 (captions.list 50 + captions.download 200). Nothing on this screen walks
 * the whole channel by itself — every call is one press.
 */

/** YouTube's own limits, restated so the form and the API refuse the same thing. */
export const YOUTUBE_TITLE_MAX = 100;
export const YOUTUBE_DESCRIPTION_MAX = 5000;
export const YOUTUBE_TAGS_MAX_CHARS = 500;
/** `thumbnails.set` takes JPEG or PNG up to 2 MB. */
export const MAX_YOUTUBE_THUMBNAIL_BYTES = 2 * 1024 * 1024;
export const YOUTUBE_PAGE_SIZE = 50;

/**
 * How YouTube counts the 500 characters of tags: the tags joined by commas,
 * and a tag with a space in it counted WITH the quotes it is stored in. A
 * plain sum of lengths passes 480 characters of two-word tags that YouTube
 * then refuses with «invalid tags».
 */
export function youtubeTagsLength(tags: readonly string[]): number {
  if (tags.length === 0) return 0;
  const chars = tags.reduce((sum, tag) => sum + tag.length + (/\s/.test(tag) ? 2 : 0), 0);
  return chars + tags.length - 1;
}

/** One tag as YouTube stores it: trimmed, no `<` or `>`, no commas (the separator). */
export function cleanTag(raw: string): string {
  return raw.replace(/[<>,]/g, ' ').replace(/\s+/g, ' ').trim();
}

export const YoutubeTagsSchema = z
  .array(z.string().trim().min(1).max(YOUTUBE_TAGS_MAX_CHARS))
  .max(500)
  .refine((tags) => youtubeTagsLength(tags) <= YOUTUBE_TAGS_MAX_CHARS, {
    message: `tags exceed ${YOUTUBE_TAGS_MAX_CHARS} characters`,
  });

/**
 * The categories worth offering. YouTube has ~30 assignable ids per region;
 * a teacher's channel uses a handful. A video already in a category not on
 * this list keeps it — the editor shows the raw id rather than overwriting it.
 */
export const YOUTUBE_CATEGORIES = [
  { id: '27', labelAr: 'تعليم' },
  { id: '28', labelAr: 'علوم وتكنولوجيا' },
  { id: '26', labelAr: 'شروحات ونصايح' },
  { id: '22', labelAr: 'ناس ومدونات' },
  { id: '24', labelAr: 'ترفيه' },
  { id: '25', labelAr: 'أخبار وسياسة' },
  { id: '29', labelAr: 'منظمات غير ربحية' },
  { id: '1', labelAr: 'أفلام ورسوم متحركة' },
  { id: '10', labelAr: 'موسيقى' },
  { id: '17', labelAr: 'رياضة' },
  { id: '20', labelAr: 'ألعاب' },
  { id: '23', labelAr: 'كوميديا' },
] as const;

export const YoutubeCategoryIdSchema = z.string().regex(/^\d{1,3}$/);

export const YOUTUBE_PRIVACY = ['public', 'unlisted', 'private'] as const;
export const YoutubePrivacySchema = z.enum(YOUTUBE_PRIVACY);
export type YoutubePrivacy = z.infer<typeof YoutubePrivacySchema>;

/**
 * What makes a video «weak» at a glance. Computed by the API from the
 * snippet it already has, so the list costs no extra unit for them.
 */
export const YOUTUBE_VIDEO_FLAGS = ['noDescription', 'noSiteLink', 'noTags', 'noChapters'] as const;
export const YoutubeVideoFlagSchema = z.enum(YOUTUBE_VIDEO_FLAGS);
export type YoutubeVideoFlag = z.infer<typeof YoutubeVideoFlagSchema>;

/** A description shorter than this is a placeholder, not a description. */
export const YOUTUBE_THIN_DESCRIPTION = 40;

export function youtubeVideoFlags(
  snippet: { description?: string | null; tags?: readonly string[] | null },
  siteHost: string,
): YoutubeVideoFlag[] {
  const description = (snippet.description ?? '').trim();
  const flags: YoutubeVideoFlag[] = [];
  if (description.length < YOUTUBE_THIN_DESCRIPTION) flags.push('noDescription');
  const host = siteHost.replace(/^www\./, '').toLowerCase();
  if (!host || !description.toLowerCase().includes(host)) flags.push('noSiteLink');
  if (!snippet.tags || snippet.tags.length === 0) flags.push('noTags');
  if (!hasChapters(description)) flags.push('noChapters');
  return flags;
}

/**
 * Whether YouTube will show chapters for this description: at least three
 * timestamp lines, the first at 0:00. (YouTube also wants each ≥ 10 s long;
 * a description that gets this far almost always does.)
 */
export function hasChapters(description: string): boolean {
  const stamps = description
    .split('\n')
    .map((line) => /^\s*\(?(\d{1,2}(?::\d{2}){1,2})\)?\s/.exec(line)?.[1])
    .filter((stamp): stamp is string => Boolean(stamp));
  if (stamps.length < 3) return false;
  return /^0{1,2}:00(?::00)?$/.test(stamps[0]!);
}

/** «تعليم» — what the new-video checklist expects a lesson to be filed under. */
export const YOUTUBE_EDUCATION_CATEGORY = '27';

/**
 * The course link that goes under a video, tagged so the analytics can tell a
 * visitor YouTube sent from one who searched. The campaign is the VIDEO, so
 * «which video sells» is one filter.
 */
export function youtubeCourseLink(courseUrl: string, videoId: string): string {
  const url = new URL(courseUrl);
  url.searchParams.set('utm_source', 'youtube');
  url.searchParams.set('utm_medium', 'description');
  url.searchParams.set('utm_campaign', videoId);
  return url.toString();
}

/** YouTube video ids: 11 characters of base64url. Checked before any id reaches a URL. */
export const YoutubeVideoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);

export const YoutubeChannelSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** `yt3.ggpht.com` — rendered through `next/image`, never as a bare `<img>`. */
  avatarUrl: z.string().nullable(),
  /** `null` when the channel hides its count. */
  subscriberCount: z.number().int().nullable(),
  videoCount: z.number().int().nullable(),
  customUrl: z.string().nullable(),
});
export type YoutubeChannel = z.infer<typeof YoutubeChannelSchema>;

export const YoutubeCourseOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Absolute, on this stack's `APP_URL`, without UTM — `youtubeCourseLink` adds it per video. */
  url: z.string(),
});
export type YoutubeCourseOption = z.infer<typeof YoutubeCourseOptionSchema>;

export const YoutubeStudioStateSchema = z.object({
  /** Both OAuth variables are set on this stack. `false` = the friendly «not available» panel. */
  configured: z.boolean(),
  connection: z
    .object({
      channel: YoutubeChannelSchema,
      tokenHint: z.string().nullable(),
      connectedAt: z.string(),
    })
    .nullable(),
  courses: z.array(YoutubeCourseOptionSchema),
  /**
   * Videos the watcher saw arrive since the channel was connected and nobody
   * has handled yet, newest first — read from the platform's own table, so
   * the hero card costs no quota.
   */
  newVideos: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      thumbnailUrl: z.string().nullable(),
      publishedAt: z.string().nullable(),
    }),
  ),
  /** Host of this stack's site — what «من غير لينك الموقع» looks for. */
  siteHost: z.string(),
});
export type YoutubeStudioState = z.infer<typeof YoutubeStudioStateSchema>;

export const YoutubeConnectStartSchema = z.object({ url: z.string() });
export type YoutubeConnectStart = z.infer<typeof YoutubeConnectStartSchema>;

export const YoutubeVideoRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  privacy: YoutubePrivacySchema.nullable(),
  views: z.number().int().nullable(),
  likes: z.number().int().nullable(),
  publishedAt: z.string().nullable(),
  flags: z.array(YoutubeVideoFlagSchema),
  categoryId: z.string().nullable(),
  /** Uploaded after the channel was connected, and not yet handled here — the «جديد» badge. */
  isNew: z.boolean(),
  /**
   * A thumbnail was set FROM THIS SCREEN. The Data API does not say whether a
   * video's thumbnail is custom or auto-picked, so `false` means «unknown»,
   * never «missing».
   */
  thumbnailSetHere: z.boolean(),
});
export type YoutubeVideoRow = z.infer<typeof YoutubeVideoRowSchema>;

export const YoutubeVideoListSchema = z.object({
  items: z.array(YoutubeVideoRowSchema),
  nextPageToken: z.string().nullable(),
  totalResults: z.number().int().nullable(),
});
export type YoutubeVideoList = z.infer<typeof YoutubeVideoListSchema>;

export const YoutubeVideoDetailSchema = YoutubeVideoRowSchema.extend({
  description: z.string(),
  tags: z.array(z.string()),
  categoryId: z.string(),
  defaultLanguage: z.string().nullable(),
  /** ISO-8601 duration from `contentDetails`, e.g. `PT14M3S`. */
  duration: z.string().nullable(),
});
export type YoutubeVideoDetail = z.infer<typeof YoutubeVideoDetailSchema>;

/**
 * A save. Every field OPTIONAL with no `.default()` — an absent field means
 * «keep what YouTube has», and the API reads the current snippet and writes it
 * back whole, because `videos.update` REPLACES the part it is sent.
 */
export const YoutubeVideoUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(YOUTUBE_TITLE_MAX).refine((v) => !/[<>]/.test(v), {
      message: 'title may not contain < or >',
    }),
    description: z.string().max(YOUTUBE_DESCRIPTION_MAX).refine((v) => !/[<>]/.test(v), {
      message: 'description may not contain < or >',
    }),
    tags: YoutubeTagsSchema,
    categoryId: YoutubeCategoryIdSchema,
  })
  .partial()
  .strict();
export type YoutubeVideoUpdate = z.infer<typeof YoutubeVideoUpdateSchema>;

export const YoutubeSuggestRequestSchema = z
  .object({
    /** The platform course whose link goes under the video. `null` = no link line. */
    courseId: z.string().min(1).max(64).nullable(),
  })
  .strict();
export type YoutubeSuggestRequest = z.infer<typeof YoutubeSuggestRequestSchema>;

export const YoutubeSuggestionSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  /** Where the chapters came from: the video's own captions, or none could be read. */
  source: z.enum(['captions', 'title']),
  chapterCount: z.number().int(),
  /**
   * Words in the suggestion that only work on a male reader. The prompt forbids
   * them; a model does not always listen, so the editor shows what slipped
   * through before anyone presses حفظ.
   */
  voiceWarnings: z.array(z.string()),
});
export type YoutubeSuggestion = z.infer<typeof YoutubeSuggestionSchema>;

/**
 * The masculine-address tripwire the copy specs carry (`outreach/compose.spec.ts`),
 * as a runtime value: a video description is read by every student, and the
 * platform never asks which.
 */
export const MASCULINE_ADDRESS_WORDS: ReadonlySet<string> = new Set([
  'راجع', 'ارجع', 'خد', 'روح', 'دوس', 'كمّل', 'كمل', 'اشترك', 'افتكر', 'شوف', 'ركّز', 'ركز', 'ادخل', 'ذاكر',
  'حاول', 'جرّب', 'جرب', 'احفظ', 'اعمل', 'انشر', 'اكتب', 'افتح', 'نزّل', 'انسخ', 'امسح', 'استخدم', 'خلّي',
  'سيب', 'حط', 'عدّل', 'متخافش', 'متقلقش', 'متنساش', 'مشترك', 'فاهم', 'حابب', 'فاكر', 'عامل', 'بتذاكر',
  'تقدر', 'تستاهله', 'جبت', 'ذاكرت', 'غلطت', 'نجحت', 'دخلت', 'خلصت', 'معاك', 'وراك', 'بيك', 'ليك', 'فيك',
  'متأكد', 'تابع', 'اضغط', 'سجّل', 'سجل', 'اتعلم', 'اتعلّم', 'انضم',
]);

export function masculineWords(text: string): string[] {
  const found = new Set<string>();
  for (const token of text.split(/[\s،.:؟?!—«»…()٪,\n\-|/#]+/u)) {
    if (MASCULINE_ADDRESS_WORDS.has(token)) found.add(token);
  }
  return [...found];
}
