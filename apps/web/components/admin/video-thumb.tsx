import { Film } from 'lucide-react';
import { youTubeThumbnailUrl } from '@ayman/contracts/video';
import type { VideoProvider } from '@ayman/contracts/video';
import { cn } from '@ayman/ui/lib/cn';

/**
 * A video's face on the stats screens — YouTube's own thumbnail for a YouTube
 * lecture, a coloured tile for an upload.
 *
 * Why not the upload's poster: it lives on the video origin, whose base URL
 * only the API knows (`VIDEO_MIRROR_PUBLIC_URL`), and is only there once the
 * ladder is `ready`. A tile that is always right beats a poster that is a
 * broken image on every video still processing. `i.ytimg.com` is the one
 * remote host the CSP's `img-src` allows, for exactly this use.
 *
 * No hooks, no `'use client'` — the tables that sort client-side and the
 * pages that render on the server both mount it.
 */
export function VideoThumb({
  provider,
  externalId,
  duration,
  className,
}: {
  provider: VideoProvider;
  externalId: string;
  /** Already formatted (`12:04`), or null to leave the corner empty. */
  duration: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative block aspect-video shrink-0 overflow-hidden rounded-md border border-line bg-surface-3',
        className,
      )}
    >
      {provider === 'youtube' ? (
        <img
          src={youTubeThumbnailUrl(externalId)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span
          className="grid size-full place-items-center text-accent-text"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in oklab, var(--viz-1) 34%, var(--n-2)), color-mix(in oklab, var(--viz-4) 26%, var(--n-2)))',
          }}
        >
          <Film className="size-1/3 max-h-10 max-w-10 opacity-80" />
        </span>
      )}
      {duration !== null ? (
        <span
          dir="ltr"
          className="mono tabular absolute bottom-1 end-1 rounded-xs bg-[color-mix(in_oklab,var(--n-1)_82%,transparent)] px-1 text-[length:var(--fs-mono-label)] text-fg"
        >
          {duration}
        </span>
      ) : null}
    </span>
  );
}

/** `12:04` / `1:02:09` — the clock YouTube prints on a thumbnail. */
export function clockDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
