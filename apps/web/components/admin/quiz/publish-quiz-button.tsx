'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { apiPost } from '@/lib/api';

const PublishResultSchema = z.object({ ok: z.boolean() });

/**
 * The preflight the brief calls for lives server-side, in
 * `QuizBuilderService.publish` — a slot with no ready version, or a pool
 * that cannot fill its `pickCount`, comes back as a 400 with a machine
 * `code`. This surfaces whatever the server actually rejected rather than a
 * generic failure.
 */
export function PublishQuizButton({ quizId, isPublished }: { quizId: string; isPublished: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function publish() {
    setPending(true);
    try {
      await apiPost(`/api/admin/quizzes/${quizId}/publish`, PublishResultSchema, {});
      toast.success(copy.quizAdmin.publishQuiz);
      router.refresh();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    } finally {
      setPending(false);
    }
  }

  if (isPublished) {
    return <Badge tone="accent">{copy.admin.course.statusPublished}</Badge>;
  }

  return (
    <Button type="button" onClick={publish} disabled={pending}>
      {copy.quizAdmin.publishQuiz}
    </Button>
  );
}
