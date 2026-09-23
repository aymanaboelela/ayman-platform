import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { GuardianCodeCard } from './guardian-code-card';

afterEach(cleanup);

const c = copy.dashboard.guardianCode;
const CODE = 'N5YGWJ7PE22Y9BKW4MSDDTPXTV';

/**
 * كارت «كود ولي الأمر».
 *
 * الكارت ده بيعرض **مفتاح** بيفتح سجل الطالب كامل لأي حد معاه، والطالب
 * بياخده ويدّيه لأبوه. فاللي بيتحمى هنا تلات حاجات كل واحدة فيها بتكسر
 * الاستخدام لو راحت.
 */
describe('the guardian code card', () => {
  /*
   * ⚠️ `dir="ltr"` — ٢٦ حرف لاتيني جوّه صفحة عربي بيتقلبوا من غيره.
   *
   * والكود المقلوب **كود تاني خالص**: الأب بيكتبه ويتقاله غلط، والطالب بيبص
   * على الشاشة ويلاقيه مكتوب صح. مفيش حاجة في الشاشتين بتقول إن ده اللي حصل.
   */
  it('prints the code left-to-right, because a flipped code is a different code', () => {
    const { container } = render(<GuardianCodeCard code={CODE} />);
    const el = container.querySelector('code');
    expect(el?.textContent).toBe(CODE);
    expect(el?.getAttribute('dir')).toBe('ltr');
  });

  /*
   * الكود مكتوب بالكامل، مش مخبّي ورا «اضغط عشان تشوف».
   *
   * الحاجات السرية التانية بتتخبّى لأن صاحبها شايفها خلاص؛ ده العكس —
   * الطالب لازم يقراه أو يبعته، وإخفاؤه بيزوّد خطوة على الحاجة الوحيدة
   * اللي الكارت موجود عشانها.
   */
  it('shows the whole code, not a masked one', () => {
    render(<GuardianCodeCard code={CODE} />);
    expect(screen.getByText(CODE)).toBeTruthy();
  });

  /*
   * والتحذير موجود: الكارت بيقول للطالب يعمل إيه بالكود، ولازم يقول كمان
   * إنه مش حاجة تتنشر — من غير ما يخوّفه من الحاجة نفسها.
   */
  it('says who it is for, and that it is not for anyone else', () => {
    render(<GuardianCodeCard code={CODE} />);
    expect(screen.getByText(c.lead)).toBeTruthy();
    expect(screen.getByText(c.warning)).toBeTruthy();
  });
});
