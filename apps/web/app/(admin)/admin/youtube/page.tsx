import { notFound } from 'next/navigation';
import { youtubeStudioCopy } from '@ayman/contracts/copy/youtube-studio';
import {
  YoutubeStudioStateSchema,
  YoutubeVideoIdSchema,
  YoutubeVideoListSchema,
  type YoutubeVideoList,
} from '@ayman/contracts/youtube/studio';
import { AdminApiError, adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { can, getSession } from '@/lib/session';
import { youtubeErrorText } from '@/lib/youtube-studio/errors';
import { YoutubeStudio, type CallbackOutcome } from './studio';
import './youtube.css';

export const metadata = { title: youtubeStudioCopy.title };

const OUTCOMES: readonly CallbackOutcome[] = ['connected', 'denied', 'expired', 'noChannel', 'noRefresh', 'failed'];

/**
 * `/admin/youtube` — «يوتيوب».
 *
 * The first page of uploads is read HERE, on the server, so the screen opens
 * with real thumbnails rather than a spinner; «هات ٥٠ كمان» pages from the
 * browser. The API caches a page for a minute, so a refresh costs no quota.
 *
 * `?yt=` is where the OAuth callback lands (one of six fixed words), and
 * `?video=` opens one video's editor — the link the «نزل فيديو جديد»
 * notification carries.
 */
export default async function YoutubeStudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Not «forbidden»: on a stack without the feature this section is not here.
  if (!(await getEntitlements()).youtubeStudio) notFound();
  const session = await getSession();
  if (!can(session, 'social:read')) notFound();

  const params = await searchParams;
  const state = await adminGet('/api/admin/youtube', YoutubeStudioStateSchema);

  let list: YoutubeVideoList | null = null;
  let listError: string | null = null;
  if (state.connection) {
    try {
      list = await adminGet('/api/admin/youtube/videos', YoutubeVideoListSchema);
    } catch (error) {
      if (!(error instanceof AdminApiError)) throw error;
      listError = youtubeErrorText(error.status, error.payload);
    }
  }

  const callback = OUTCOMES.find((outcome) => outcome === params.yt) ?? null;
  const requested = typeof params.video === 'string' && YoutubeVideoIdSchema.safeParse(params.video).success ? params.video : null;

  return (
    <YoutubeStudio
      state={state}
      initialList={list}
      listError={listError}
      callback={callback}
      openVideo={requested}
      canWrite={can(session, 'social:write')}
      canPublish={can(session, 'social:publish')}
    />
  );
}
