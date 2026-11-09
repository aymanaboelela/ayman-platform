import { describe, expect, it } from 'vitest';
import { masculineAddress, masculineCorrection } from '@ayman/contracts/assistant/voice';

describe('masculineAddress', () => {
  /* Each of these was sent to a real student by the model, 2026-11-03..09. */
  it.each([
    ['لو عايز تكمل من الترم التاني لازم تكون فاتح الكورس', ['عايز', 'تكمل']],
    ['ممكن تتواصل مع المهندس عشان يشوف الطلب', ['تتواصل']],
    ['لو محتاج مساعدة، ابعت رسالة للفريق', ['محتاج', 'ابعت']],
    ['الدروس متاحة ليك على طول وتقدر تذاكر', ['ليك', 'تقدر', 'تذاكر']],
  ])('flags «%s»', (text, words) => {
    expect(masculineAddress(text)).toEqual(expect.arrayContaining(words));
  });

  it('passes the neutral forms the prompt asks for', () => {
    for (const text of [
      'الدروس متاحة فورًا بعد الاشتراك، والمذاكرة في أي وقت.',
      'أوصّل السؤال للمهندس وهو يرد هنا.',
      'العفو 🌷 في الخدمة.',
      'حضرتك تقدري',
    ]) {
      expect(masculineAddress(text).filter((w) => w !== 'تقدر')).toEqual([]);
    }
  });

  it('sees through a glued «و»', () => {
    expect(masculineAddress('وتقدر تبدأ')).toContain('تقدر');
  });

  it('names the words in the correction it builds', () => {
    expect(masculineCorrection(['عايز', 'ليك'])).toContain('«عايز»');
  });
});
