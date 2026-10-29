import '../../(admin)/admin/youtube/youtube.css';
import type { YoutubeStudioState, YoutubeVideoList, YoutubeVideoRow } from '@ayman/contracts/youtube/studio';
import { YoutubeStudio } from '../../(admin)/admin/youtube/studio';

/**
 * `/dev/youtube-studio` — «يوتيوب» with a fixed channel and fixed videos, for
 * designing the screen without a Google project, a connected channel or the
 * API. Thumbnails are YouTube's own placeholder frames. 404 in production
 * (`isDevOnlyRoute`).
 */
const row = (i: number, over: Partial<YoutubeVideoRow> = {}): YoutubeVideoRow => ({
  id: `vid${String(i).padStart(8, '0')}`,
  title: ['شرح المصفوفات في بايثون من الصفر', 'حل امتحان الشهر الأول — الصف التاني', 'Lists vs Tuples في دقيقتين', 'مراجعة ليلة الامتحان: قواعد البيانات'][i % 4]!,
  thumbnailUrl: null,
  privacy: i % 5 === 3 ? 'unlisted' : i % 7 === 6 ? 'private' : 'public',
  views: 1200 * (i + 1) + 37,
  likes: 40 * (i + 1),
  publishedAt: new Date(Date.UTC(2026, 9, 28 - i * 3)).toISOString(),
  flags: (
    [[], ['noChapters'], ['noDescription', 'noSiteLink', 'noTags', 'noChapters'], ['noSiteLink'], ['noTags', 'noChapters']] as const
  )[i % 5]!.slice(),
  categoryId: i % 4 === 2 ? '22' : '27',
  isNew: i === 0,
  thumbnailSetHere: i % 3 === 0,
  ...over,
});

const items = Array.from({ length: 9 }, (_, i) => row(i, i === 0 ? { title: 'VID_20261030_101500.mp4', flags: ['noDescription', 'noSiteLink', 'noTags', 'noChapters'], categoryId: '22' } : {}));

const state: YoutubeStudioState = {
  configured: true,
  connection: {
    channel: { id: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'قناة المادة', avatarUrl: null, subscriberCount: 48200, videoCount: 312, customUrl: '@channel' },
    tokenHint: 'a9Xz',
    connectedAt: new Date(Date.UTC(2026, 9, 1)).toISOString(),
  },
  courses: [{ id: 'c1', title: 'برمجة — تانية ثانوي', url: 'https://example.com/courses/prog-y2' }],
  newVideos: [{ id: items[0]!.id, title: items[0]!.title, thumbnailUrl: null, publishedAt: items[0]!.publishedAt }],
  siteHost: 'example.com',
};

const list: YoutubeVideoList = { items, nextPageToken: 'NEXT', totalResults: 312 };

export default function YoutubeStudioDevPage() {
  return (
    <main className="mx-auto max-w-6xl p-4">
      <YoutubeStudio state={state} initialList={list} listError={null} callback={null} openVideo={null} canWrite canPublish />
    </main>
  );
}
