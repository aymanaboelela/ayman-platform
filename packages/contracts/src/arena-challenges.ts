import { z } from '@ayman/contracts/zod';

/**
 * «ساحة التحدي» على «التحديات» — طريقتين يتلعب بيهم الماتش بدل «الكورس كله»:
 *
 *   1. **تحدّي الأدمن**: اللوبي بيعرض التحديات المتشغّلة في كل كورس
 *      (`quiz/challenges.ts`). الطالب بيختار واحد، وبيتقابل مع حد من دفعته
 *      اختار نفس التحدّي — طابور لكل (كورس × دفعة × تحدّي).
 *   2. **تحدّي الطالب**: الطالب بيختار تحدّي أو أكتر من كورسه ويفتح «تحدّي
 *      مفتوح». بيظهر في لوبي زمايله في نفس الطابور (نفس الكورس ونفس الدفعة:
 *      النظام × السنة × عربي/لغات)، وأول واحد يقبله بيبدأ الماتش.
 *
 * القواعد زي ما هي (`ARENA_RULES`): ٧ أسئلة، ١٥ ثانية، وسقف النقط.
 *
 * موديول لوحده، مش exports جديدة على `arena.ts` — نفس سبب كل موديول جديد
 * هنا (`turbopack-module-ids-outlive-a-deploy`). مفيش imports نسبية.
 *
 * ⚠️ زي باقي الساحة: الـuserId بتاع طالب تاني عمره ما بيتبعت — اسمه المختصر
 * وصورته بس، و`mine` بيقول لو التحدّي ده بتاعك.
 */

/** تحدّي من تحديات الأدمن في كورس، وبنك الطالب فيه. */
export const ArenaTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** أسئلة بنك الطالب في التحدّي ده (نظامه، والامتحانات اللي سلّمها). */
  questions: z.number().int().min(0),
  /** `questions >= ARENA_RULES.minPool`. */
  playable: z.boolean(),
  /** كام حد مستني في طابور التحدّي ده دلوقتي (من دفعتك). */
  waiting: z.number().int().min(0),
});
export type ArenaTopic = z.infer<typeof ArenaTopicSchema>;

/** تحدّي مفتوح من طالب، مستني حد يقبله. */
export const ArenaOpenChallengeSchema = z.object({
  id: z.string(),
  /** اللي فتحه — الاسم المختصر والصورة بس. */
  by: z.object({ name: z.string(), image: z.string().nullable() }),
  courseId: z.string(),
  courseTitle: z.string(),
  topicTitles: z.array(z.string()),
  /** اتفتح إمتى (ساعة السيرفر). */
  since: z.number().int().nonnegative(),
  /** التحدّي ده بتاعك — مايتقبلش منك. */
  mine: z.boolean(),
});
export type ArenaOpenChallenge = z.infer<typeof ArenaOpenChallengeSchema>;

/** أكتر عدد تحديات في تحدّي طالب واحد. */
export const ARENA_CHALLENGE_MAX_TOPICS = 10;

/** `POST /api/me/arena/challenges` — تحدّي جديد من الطالب. */
export const ArenaChallengeCreateSchema = z
  .object({
    courseId: z.uuid(),
    topicIds: z.array(z.uuid()).min(1).max(ARENA_CHALLENGE_MAX_TOPICS),
  })
  .strict();
export type ArenaChallengeCreate = z.infer<typeof ArenaChallengeCreateSchema>;

/**
 * «يلا نبدأ» المتصفح عايزها — بتتحفظ عشان لو السيرفر اتعمله ريستارت والطابور
 * وقع، الطالب يرجع لنفس الحاجة لوحده. نص واحد عشان حالة الصفحة تفضل بسيطة:
 *
 *   · `<courseId>`                — الكورس كله (كورس مالوش تحديات)
 *   · `t:<courseId>:<topicId>`    — تحدّي من تحديات الأدمن
 *   · `n:<courseId>:<id>,<id>`    — تحدّي جديد هيتفتح
 *   · `c:<challengeId>`           — تحدّي مفتوح (بتاعك، أو قبلته)
 */
export type ArenaIntent =
  | { kind: 'course'; courseId: string }
  | { kind: 'topic'; courseId: string; topicId: string }
  | { kind: 'create'; courseId: string; topicIds: string[] }
  | { kind: 'challenge'; challengeId: string };

export function encodeArenaIntent(intent: ArenaIntent): string {
  switch (intent.kind) {
    case 'course':
      return intent.courseId;
    case 'topic':
      return `t:${intent.courseId}:${intent.topicId}`;
    case 'create':
      return `n:${intent.courseId}:${intent.topicIds.join(',')}`;
    case 'challenge':
      return `c:${intent.challengeId}`;
  }
}

export function decodeArenaIntent(raw: string): ArenaIntent {
  const [kind, a = '', b = ''] = raw.split(':');
  if (kind === 't' && a && b) return { kind: 'topic', courseId: a, topicId: b };
  if (kind === 'n' && a && b) return { kind: 'create', courseId: a, topicIds: b.split(',').filter(Boolean) };
  if (kind === 'c' && a) return { kind: 'challenge', challengeId: a };
  return { kind: 'course', courseId: raw };
}

/** اللي الطالب مستنيه دلوقتي، من حالة الطابور اللي السيرفر بعتها. */
export function intentOfQueue(view: { courseId: string; topicId?: string | null; challengeId?: string | null }): string {
  if (view.challengeId) return encodeArenaIntent({ kind: 'challenge', challengeId: view.challengeId });
  if (view.topicId) return encodeArenaIntent({ kind: 'topic', courseId: view.courseId, topicId: view.topicId });
  return encodeArenaIntent({ kind: 'course', courseId: view.courseId });
}
