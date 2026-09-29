import { RankNextStepsSchema, type RankNextSteps } from '@ayman/contracts/rank-next';
import { apiGetAuthed } from './api-server';

/**
 * `GET /api/me/rank/next` — «الطريق لفوق» بصفوفه، أو `null` لو ماجاش.
 *
 * `null` مش رمية، عن قصد: الصفحة بتقرا الترتيب من راوت تاني، ودي تكملة ليه.
 * لو وقعت (٤٢٩ من الـthrottle، أو السيرفر بيتقفل في نص ديبلوي) الكروت بترجع
 * زي ما كانت — شرح النقط وشريط «عندك N واجب» — بدل ما الصفحة كلها تقول «حصل
 * خطأ» عشان حتة منها. نفس قاعدة `getStudentExamsOrEmpty`.
 *
 * Server Components بس: `apiGetAuthed` بيقرا `cookies()`.
 */
export async function getRankNextOrNull(): Promise<RankNextSteps | null> {
  try {
    return await apiGetAuthed('/api/me/rank/next', RankNextStepsSchema);
  } catch {
    return null;
  }
}
