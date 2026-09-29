import type { ArenaBoard, ArenaCourse, ArenaMe } from '@ayman/contracts/arena';
import type { EngineAward, EngineQuestion, MatchState } from './arena-engine';
import type { ArenaCohort } from './arena-matchmaking';

/**
 * الحاجات اللي `ArenaService` محتاجها من بره ومالهاش دعوة بالماتش نفسه —
 * كل واحدة interface عشان سبكس الطابور والماتش تشتغل من غير Postgres ولا
 * Redis، والتطبيق الحقيقي في `arena-access.service.ts`،
 * `arena-questions.service.ts`، `arena-records.service.ts`.
 */

export const ARENA_KV = Symbol('ARENA_KV');
export const ARENA_REALTIME = Symbol('ARENA_REALTIME');
export const ARENA_ACCESS = Symbol('ARENA_ACCESS');
export const ARENA_QUESTIONS = Symbol('ARENA_QUESTIONS');
export const ARENA_RECORDS = Symbol('ARENA_RECORDS');
export const ARENA_CLOCK = Symbol('ARENA_CLOCK');

export interface ArenaEligibility {
  /** الاسم المختصر اللي المنافس هيشوفه. */
  name: string;
  image: string | null;
  /** `null` = البروفايل مالوش سنة. */
  cohort: ArenaCohort | null;
  cohortLabel: string;
  blocked: 'no_year' | 'no_subscription' | null;
  /** كورسات **مدفوعة** وشغّالة بس، وكام سؤال في بنكه لكل واحد. */
  courses: ArenaCourse[];
}

export interface ArenaAccessPort {
  eligibility(userId: string): Promise<ArenaEligibility>;
}

export interface ArenaQuestionsPort {
  /** نفس الأسئلة للاتنين، بالترتيب، من غير ما الصح يطلع من السيرفر. */
  build(courseId: string, userIds: [string, string], count: number): Promise<EngineQuestion[]>;
}

export interface ArenaRecordsPort {
  /** الماتش خلص: يتكتب، والنقط تتحسب بعد السقف. مرتين لنفس الماتش = نفس النتيجة. */
  record(state: MatchState): Promise<[EngineAward, EngineAward]>;
  me(userId: string, cohort: ArenaCohort | null): Promise<Omit<ArenaMe, 'name' | 'image'>>;
  board(userId: string, cohort: ArenaCohort | null, cohortLabel: string): Promise<ArenaBoard>;
}
