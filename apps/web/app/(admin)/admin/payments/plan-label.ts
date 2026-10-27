import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { AdminPaymentRow } from '@ayman/contracts/admin/payments';

const c = copy.admin.payments;

const PLAN_LABEL: Record<Exclude<AdminPaymentRow['plan'], 'term'>, string> = {
  monthly: c.planMonthly,
  quarterly: c.planQuarterly,
  yearly: c.planYearly,
};

/**
 * «شهرين — شهر ٢، شهر ٣» — العربي بيعُد تلات طرق، والرقم المجرّد مش واحدة منهم.
 *
 * «٢ شهر» مش جملة عربية، و«٢ شهور» كمان لأ. المثنى كلمة لوحده.
 */
function monthsPhrase(count: number): string {
  if (count === 1) return c.planMonthsOne;
  if (count === 2) return c.planMonthsTwo;
  return formatCopy(c.planMonthsMany, { count });
}

/**
 * الخطة زي ما الأدمن محتاج يقراها وهو بيوافق.
 *
 * `term` بيسمّي الترم، والشهور بتسمّي نفسها وعددها — وده اللي كان ناقص. الأدمن
 * كان بيشوف «شهر» على دفعة بتشتري تلات شهور، والمبلغ جنبها لوحده مش كفاية
 * يفرّق: ٤٥٠ صح على تلاتة وغلط على واحد.
 *
 * والترتيب من السيرفر (`monthIndex`)، مش من هنا — «شهر ٣ و٢» بتبان كغلطة.
 */
export function planLabel(row: AdminPaymentRow): string {
  if (row.plan === 'term') return formatCopy(c.planTerm, { term: row.termTitle ?? '' });
  if (row.months.length > 0) {
    return formatCopy(c.planMonths, {
      count: monthsPhrase(row.months.length),
      months: row.months.map((month) => month.title).join('، '),
    });
  }
  return PLAN_LABEL[row.plan];
}
