import { GameFinishResultSchema } from '@ayman/contracts/quiz/game';
import { apiPost } from '@/lib/api';

/**
 * «الجولة خلصت» للسيرفر — النتيجة والمدة بيتحسبوا هناك (`settleGame`)،
 * فالنداء ده مابيرجّعش حاجة الشاشة محتاجاها، ووقوعه مابيقفلش حاجة: الجولة
 * متسجّلة من أول سؤال، ومدتها لحد آخر إجابة.
 *
 * `keepalive`: «الألعاب» بعد النتيجة على طول بيسيب الصفحة، والطلب لازم
 * يكمّل بعد ما الكومبوننت يمشي.
 */
export function finishRound(sessionId: string | null, score?: number): void {
  if (!sessionId) return;
  void apiPost(
    `/api/me/game/sessions/${encodeURIComponent(sessionId)}/finish`,
    GameFinishResultSchema,
    score === undefined ? {} : { score: Math.max(0, Math.round(score)) },
    { keepalive: true },
  ).catch(() => {
    /* الجولة متسجّلة خلاص — شوف فوق */
  });
}
