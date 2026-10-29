import {
  YOUTUBE_EDUCATION_CATEGORY,
  YOUTUBE_VIDEO_FLAGS,
  type YoutubeVideoFlag,
  type YoutubeVideoRow,
} from '@ayman/contracts/youtube/studio';

/**
 * «صحة القناة» and the new-video checklist, from facts the list already has
 * — no extra quota. Pure, so the arithmetic is tested without a browser.
 */

export interface ChannelHealth {
  /** How many of the loaded videos miss each thing. */
  counts: Record<YoutubeVideoFlag, number>;
  /** 0–100: the share of (video × check) pairs that pass. `null` with nothing loaded. */
  score: number | null;
  grade: 'great' | 'good' | 'weak' | null;
  basis: number;
}

export function channelHealth(items: readonly YoutubeVideoRow[]): ChannelHealth {
  const counts = Object.fromEntries(YOUTUBE_VIDEO_FLAGS.map((flag) => [flag, 0])) as Record<YoutubeVideoFlag, number>;
  let failed = 0;
  for (const item of items) {
    for (const flag of item.flags) counts[flag] += 1;
    failed += item.flags.length;
    if (item.categoryId !== null && item.categoryId !== YOUTUBE_EDUCATION_CATEGORY) failed += 1;
  }
  const checks = items.length * (YOUTUBE_VIDEO_FLAGS.length + 1);
  const score = checks === 0 ? null : Math.round(((checks - failed) / checks) * 100);
  const grade = score === null ? null : score >= 85 ? 'great' : score >= 60 ? 'good' : 'weak';
  return { counts, score, grade, basis: items.length };
}

export type CheckState = 'ok' | 'missing' | 'unknown';

export const CHECKLIST = ['title', 'description', 'courseLink', 'chapters', 'tags', 'thumbnail', 'category'] as const;
export type ChecklistItem = (typeof CHECKLIST)[number];

/** A title shorter than this is almost always the file name YouTube kept from the upload. */
const SEARCHABLE_TITLE = 25;

export function checklist(
  video: Pick<YoutubeVideoRow, 'title' | 'flags' | 'categoryId' | 'thumbnailSetHere'>,
): Record<ChecklistItem, CheckState> {
  const has = (flag: YoutubeVideoFlag): CheckState => (video.flags.includes(flag) ? 'missing' : 'ok');
  return {
    title: video.title.trim().length >= SEARCHABLE_TITLE && !/\.(mp4|mov|mkv)$/i.test(video.title.trim()) ? 'ok' : 'missing',
    description: has('noDescription'),
    courseLink: has('noSiteLink'),
    chapters: has('noChapters'),
    tags: has('noTags'),
    // The Data API never says whether a thumbnail is custom: «unknown», not «missing».
    thumbnail: video.thumbnailSetHere ? 'ok' : 'unknown',
    category: video.categoryId === null ? 'unknown' : video.categoryId === YOUTUBE_EDUCATION_CATEGORY ? 'ok' : 'missing',
  };
}
