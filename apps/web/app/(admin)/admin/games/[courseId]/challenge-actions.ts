'use server';

import {
  AdminChallengeTopicsSchema,
  type AdminChallengeTopics,
  type ChallengeTopicInput,
  type ChallengeTopicPatch,
} from '@ayman/contracts/quiz/challenges';
import { adminSend } from '@/lib/admin-api';
import { revalidatePath } from '@/lib/revalidate-screen';

/**
 * «قسم التحديات» — ملف أكشنز لوحده مش exports جديدة على `../actions.ts`: تاب
 * فاضل مفتوح من البيلد اللي قبله بيحتفظ بالـmodule ids بتاعته
 * (`turbopack-module-ids-outlive-a-deploy`).
 *
 * كل أكشن بيرجّع الشاشة كلها من السيرفر (الأعداد والترتيب)، والكومبوننت بيرسمها.
 */
export type ChallengeResult = { ok: true; detail: AdminChallengeTopics } | { ok: false };

const path = (courseId: string, rest = '') => `/api/admin/challenge-topics/${encodeURIComponent(courseId)}${rest}`;

async function run(courseId: string, send: () => Promise<AdminChallengeTopics>): Promise<ChallengeResult> {
  try {
    const detail = await send();
    revalidatePath(`/admin/games/${courseId}`);
    return { ok: true, detail };
  } catch {
    return { ok: false };
  }
}

export async function createChallengeAction(courseId: string, input: ChallengeTopicInput): Promise<ChallengeResult> {
  return run(courseId, () => adminSend('POST', path(courseId), input, AdminChallengeTopicsSchema));
}

export async function updateChallengeAction(
  courseId: string,
  topicId: string,
  patch: ChallengeTopicPatch,
): Promise<ChallengeResult> {
  return run(courseId, () =>
    adminSend('PATCH', path(courseId, `/${encodeURIComponent(topicId)}`), patch, AdminChallengeTopicsSchema),
  );
}

export async function deleteChallengeAction(courseId: string, topicId: string): Promise<ChallengeResult> {
  return run(courseId, () =>
    adminSend('DELETE', path(courseId, `/${encodeURIComponent(topicId)}`), undefined, AdminChallengeTopicsSchema),
  );
}

export async function reorderChallengesAction(courseId: string, ids: string[]): Promise<ChallengeResult> {
  return run(courseId, () => adminSend('PUT', path(courseId, '/order'), { ids }, AdminChallengeTopicsSchema));
}
