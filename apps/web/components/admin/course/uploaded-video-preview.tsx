'use client';

import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { videoPreviewUrlAction } from '@/app/(admin)/admin/courses/actions';
import { HLS_CONFIG } from '@/components/player/mirror-video';

const c = copy.admin.lesson;

/**
 * «يبقى ظاهر لي الفيديو» — the uploaded lecture itself, on its own lesson.
 *
 * Once an upload was ready, this panel showed a sentence («خلصت، والمحاضرة
 * شغّالة عند الطلبة») and an empty drop zone — the teacher could not SEE what he
 * had uploaded without opening the cut editor or enrolling in his own course.
 * YouTube lectures have had `VideoPreview` for this since the start.
 *
 * The frame the encoder cut (`poster.jpg`, beside the ladder) until pressed,
 * then the same encrypted ladder the students get, the key fetched with the
 * admin's own session — the path `VideoTrimEditor` already proved.
 *
 * Click to load, like `VideoPreview`: a course of forty lectures must not start
 * forty players the moment the outline opens.
 */
export function UploadedVideoPreview({ externalId }: { externalId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void videoPreviewUrlAction(externalId).then((next) => {
      if (live) setUrl(next);
    });
    return () => {
      live = false;
    };
  }, [externalId]);

  useEffect(() => {
    const element = videoRef.current;
    if (!playing || url === null || !element) return undefined;
    setFailed(false);
    let hls: { destroy: () => void } | null = null;
    let live = true;
    void (async () => {
      const { default: Hls } = await import('hls.js');
      if (!live) return;
      if (Hls.isSupported()) {
        const instance = new Hls(HLS_CONFIG);
        hls = instance;
        /*
         * Without this, any fatal hls.js error (a cold edge on a
         * just-finalized manifest, the key fetch stalling, a network blip)
         * left the <video> spinning on its native "loading" indicator
         * forever — no retry, no message, no escape hatch. `MirrorVideo`
         * (the student player) has always handled this; this preview, being
         * newer and simpler, never did.
         */
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (
            data.details === Hls.ErrorDetails.KEY_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.KEY_LOAD_TIMEOUT
          ) {
            setFailed(true);
            return;
          }
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            instance.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            instance.recoverMediaError();
            return;
          }
          setFailed(true);
        });
        instance.loadSource(url);
        instance.attachMedia(element);
      } else {
        element.src = url;
      }
      // Pressing «تشغيل» IS the gesture; a browser that still refuses leaves the controls.
      void Promise.resolve(element.play()).catch(() => undefined);
    })();
    return () => {
      live = false;
      hls?.destroy();
    };
  }, [playing, url, attempt]);

  // The poster sits beside the playlist; an older upload may have none.
  const poster = url === null || posterFailed ? null : url.replace(/master\.m3u8$/, 'poster.jpg');

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        disabled={url === null}
        aria-label={c.previewPlay}
        className="group relative mb-3 block aspect-video w-full max-w-xl overflow-hidden rounded-lg border border-line bg-black disabled:cursor-wait"
      >
        {poster ? (
          <img
            src={poster}
            alt=""
            onError={() => setPosterFailed(true)}
            className="size-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02]"
          />
        ) : null}
        <span className="absolute inset-0 grid place-items-center bg-black/25">
          <span className="grid size-14 place-items-center rounded-full bg-accent text-accent-contrast shadow-lg">
            <Play className="size-6 translate-x-px" aria-hidden="true" />
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="mb-3 w-full max-w-xl">
      <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full"
          controls
          playsInline
          controlsList="nodownload"
          disablePictureInPicture
          poster={poster ?? undefined}
        />
        {failed ? (
          <div className="absolute inset-0 grid place-items-center gap-2 bg-black/80 p-4 text-center">
            <p className="text-[length:var(--fs-text-sm)] text-white">{c.previewFailed}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="rounded-full bg-accent px-4 py-1.5 text-[length:var(--fs-text-sm)] font-medium text-accent-contrast"
            >
              {c.previewRetry}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
