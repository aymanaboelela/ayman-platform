'use client';

import { copy, type HeartbeatResponse, type PlayerAttachment } from '@ayman/contracts';
import { Card, CardBody, cn } from '@ayman/ui';
import { DocumentIcon, DownloadIcon } from './icons';
import { useDwellComplete } from './use-dwell-complete';

export interface AttachmentLessonProps {
  lessonId: string;
  attachments: PlayerAttachment[];
  alreadyComplete: boolean;
  onProgress: (response: HeartbeatResponse) => void;
}

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB` : `${Math.max(Math.round(bytes / 1024), 1)} KB`;
}

export function AttachmentLesson({
  lessonId,
  attachments,
  alreadyComplete,
  onProgress,
}: AttachmentLessonProps) {
  useDwellComplete({ lessonId, enabled: !alreadyComplete, onResponse: onProgress });

  return (
    <Card>
      <CardBody className="p-0">
        <ul>
          {attachments.map((attachment) => (
            <li key={attachment.id} className="border-b border-line-subtle last:border-b-0">
              <a
                href={attachment.downloadPath}
                // Same-origin path that re-checks enrollment server-side
                // before redirecting — never the storage URL itself.
                className={cn(
                  'flex items-center gap-3 px-5 py-4',
                  'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                )}
              >
                <DocumentIcon className="text-fg-muted" />
                <span className="min-w-0 flex-1 text-start">
                  <span className="block truncate">{attachment.filename}</span>
                  <span className="mono tabular block text-[length:var(--fs-mono-label)] text-fg-muted">
                    {formatSize(attachment.sizeBytes)}
                  </span>
                </span>
                <span className="mono flex items-center gap-1.5 text-[length:var(--fs-mono-label)] text-accent-text">
                  <DownloadIcon className="h-3.5 w-3.5" />
                  {copy.player.download}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
