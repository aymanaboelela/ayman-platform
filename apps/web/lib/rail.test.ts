import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIL_EXPANDS_FROM_PX, resolveRail } from './rail';
import { PREPAINT_SCRIPT } from './security/prepaint-script';

/**
 * عقد الريل تلات حالات، والافتراضي بيتقرر من العرض.
 *
 * الريل ٢٩٦ بكسل، وعلى آيباد رأسي (٨٢٠) كان بيسيب ٥٢٤ للمحتوى — عرض فون على
 * تابلت. الحل إنه يبدأ مقفول تحت ١٠٢٤، واللي ده بيحتاجه هو قيمة تقول «فاتحها
 * بإيدي» تغلب الافتراضي. العقد القديم (قيمة واحدة + الغياب = مفتوح) مكانش
 * عنده القيمة دي.
 */
describe('resolveRail', () => {
  it('honours an explicit choice at any width', () => {
    // ده الفيتشر كله: الطالب اللي فتحها على تابلت مايرجعش يلاقيها مقفولة.
    expect(resolveRail('expanded', false)).toBe('expanded');
    expect(resolveRail('collapsed', true)).toBe('collapsed');
  });

  it('falls back to the width when nothing was chosen', () => {
    expect(resolveRail(null, true)).toBe('expanded');
    expect(resolveRail(null, false)).toBe('collapsed');
  });
});

describe('the rail breakpoint', () => {
  /*
   * ⚠️ الرقم مكتوب مرتين — في `lib/rail.ts` وفي `globals.css` — والملفين
   * مايقدروش يتشاركوا قيمة (واحد TS والتاني CSS). لو اتفرقوا، الزرار بيقول
   * «اقفل» على ريل مقفول في المدى اللي بينهم: الـCSS قافل والحالة في رياكت
   * فاتحة. مفيش CSS بيصلّح ده، والسكرين ريدر بيقرا الغلط.
   *
   * فالتست بيقرا الملف وبيقارن. `63.999rem` سقف المدى، يعني الفتح بيبدأ من
   * `64rem` = ١٠٢٤ بكسل.
   */
  it('matches the ceiling the stylesheet collapses up to', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'app', 'globals.css'), 'utf8');
    const match = css.match(/@media \(min-width: 48rem\) and \(max-width: ([\d.]+)rem\)/);

    expect(match).not.toBeNull();
    const ceilingRem = Number(match?.[1]);
    // السقف + خطوة واحدة = نقطة الفتح. الـrem هنا ١٦ بكسل، وهو الأساس اللي
    // `typography.css` مابيغيّرهوش على الروت.
    expect(Math.ceil(ceilingRem) * 16).toBe(RAIL_EXPANDS_FROM_PX);
  });
});

describe('PREPAINT_SCRIPT', () => {
  /*
   * السكريبت بيتهَش لـCSP في `proxy.ts` من نفس الثابت، فتغييره آمن. اللي مش
   * آمن إنه يفضل كاتب قيمة واحدة: الغياب بقى معناه «مختارش»، ولو السكريبت
   * مابيكتبش `'expanded'` فالطالب اللي فتحها بإيده على تابلت بيلاقيها بتتقفل
   * على كل تحميل صفحة — قبل ما رياكت يشتغل خالص.
   */
  it('stamps an explicitly expanded rail too, not only a collapsed one', () => {
    expect(PREPAINT_SCRIPT).toContain("r==='collapsed'||r==='expanded'");
  });

  it('still writes the theme unconditionally', () => {
    // الثيم عقده مختلف عن الريل عن قصد — بيتكتب دايمًا بافتراضي `light`.
    expect(PREPAINT_SCRIPT).toContain("d.setAttribute('data-theme'");
  });
});
