'use client';

import type { HeartbeatResponse, PlayerResource } from '@ayman/contracts';
import { ResourceList } from './resource-list';
import { useDwellComplete } from './use-dwell-complete';

export interface AttachmentLessonProps {
  lessonId: string;
  resources: PlayerResource[];
  alreadyComplete: boolean;
  onProgress: (response: HeartbeatResponse) => void;
}

/**
 * A lesson whose BODY is its materials — `kind === 'attachment'`.
 *
 * The only thing this adds over `<ResourceList>` is the dwell timer that marks
 * such a lesson complete after 5s on the page: there is no video to earn
 * thresholds against and no quiz to pass. Every other lesson kind renders
 * `<ResourceList>` directly with no timer, because its own body owns
 * completion.
 */
export function AttachmentLesson({
  lessonId,
  resources,
  alreadyComplete,
  onProgress,
}: AttachmentLessonProps) {
  useDwellComplete({ lessonId, enabled: !alreadyComplete, onResponse: onProgress });

  return <ResourceList resources={resources} />;
}
