'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { youTubeEmbedUrl, youTubeThumbnailUrl } from '@ayman/contracts/video';
import { Button } from '@ayman/ui/components/button';

const c = copy.admin.lesson;

/**
 * Watch the lecture from the admin, in the same frame the student gets.
 *
 * There was no way to do this at all. The only player in the product is the
 * student one at `/courses/[slug]/lessons/[lessonId]`, and that route is gated
 * on an ACTIVE ENROLMENT compiled into the Prisma `where` — role is never
 * consulted, so an instructor opening their own lecture gets a 404 and a
 * redirect. Checking your own video meant enrolling yourself in your own
 * course, or publishing it and asking a student.
 *
 * This is deliberately NOT `<VideoLesson>`: that component records progress,
 * resumes from a stored position and reports completion, none of which should
 * happen because an instructor glanced at their own lecture. A bare embed
 * against the same `youtube-nocookie` origin answers the only question being
 * asked — does it play?
 *
 * ## Click to load
 *
 * The frame is mounted on demand, not with the panel. A course with forty
 * lectures would otherwise load forty YouTube players the moment the outline
 * expanded — several megabytes of third-party script for a page that is mostly
 * text fields.
 */
export function VideoPreview({ externalId }: { externalId: string }) {
  const [playing, setPlaying] = useState(false);

  if (!playing) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group relative block aspect-video w-full max-w-sm overflow-hidden rounded-md border border-line bg-surface-2"
        >
          {/* YouTube's own thumbnail — no upload, no media origin, and it is
              also the fastest signal that the id is the video you meant. */}
          <img
            src={youTubeThumbnailUrl(externalId)}
            alt=""
            className="size-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02]"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="rounded-full bg-accent px-4 py-2 text-[length:var(--fs-text-sm)] font-medium text-accent-contrast">
              {c.previewPlay}
            </span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 max-w-sm space-y-2">
      <div className="aspect-video overflow-hidden rounded-md border border-line">
        <iframe
          src={youTubeEmbedUrl(externalId)}
          title={c.preview}
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setPlaying(false)}>
          {c.previewClose}
        </Button>
        {/*
          The escape hatch, and the diagnostic. If the frame above is blank or
          shows YouTube's own error while this link plays fine, the video is
          embedding-blocked — which is precisely the failure the students were
          hitting and the instructor could not reproduce.
        */}
        <a
          href={`https://www.youtube.com/watch?v=${externalId}`}
          target="_blank"
          rel="noreferrer"
          className="text-[length:var(--fs-text-sm)] text-accent-text underline"
        >
          {c.previewOnYouTube}
        </a>
      </div>
    </div>
  );
}
