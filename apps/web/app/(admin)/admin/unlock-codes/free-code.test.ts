import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { copy } from '@ayman/contracts/copy/admin';

/**
 * الكود المجاني: منحة صريحة، مش خانة سعر فاضية.
 *
 * ## اللي كان
 *
 * `priceCents` اختياري في السكيما من الأول، وخانة فاضية بتسجّل `null` صح —
 * والفلوس أصلًا مابتقراش الجدول ده («A record, not a charge: no money moves
 * through this table and finance does not read it»). يعني الكود المجاني كان
 * **شغّال** من غير ما حد يعمل حاجة.
 *
 * اللي ماكانش موجود هو إن الشاشة تقول كده. الليستة كانت بتعرض «—» رمادية،
 * وهي بتخلط حالتين مختلفتين تمامًا: منحة مقصودة لطالب مش هيدفع، وسعر حد نسي
 * يكتبه. المدرّس بيبص على الصف بعد شهر ومايعرفش أنهي واحدة فيهم.
 */
const HERE = __dirname;

function read(name: string): string {
  return readFileSync(join(HERE, name), 'utf8');
}

describe('كود مجاني', () => {
  it('الكوبي بتقول إنه منحة ومش بيتحسب في الفلوس', () => {
    expect(copy.admin.unlockCodes.priceFree).toBe('مجاني');
    // ⚠️ الجملة دي وعد للمدرّس. لو اتغيّرت لحاجة مابتقولش إنها مش بتتحسب،
    // الشاشة بتبقى بتدّعي حاجة مالهاش سند في الكود.
    expect(copy.admin.unlockCodes.priceFreeHint).toContain('مش بتتحسب');
  });

  it('المولّد بيبعت null لما يبقى مجاني، مهما كان مكتوب في الخانة', () => {
    const src = read('unlock-code-generator.tsx');

    // الاختيار بيكسب على النص: لو حد كتب رقم وبعدين اختار مجاني، المقصود هو
    // الاختيار الأخير. ترتيب الشرط هو اللي بيضمن ده.
    expect(src).toMatch(/priceCents:\s*isFree\s*\|\|/);
  });

  it('المولّد بيقفل خانة السعر بدل ما يسيبها تتكتب وتتجاهل', () => {
    const src = read('unlock-code-generator.tsx');

    // خانة شغالة وقيمتها بتترمى هي شاشة بتكدب على اللي بيكتب فيها.
    expect(src).toContain('disabled={isFree}');
  });

  it('الزرار مايتقفلش بسبب سعر فاضي لما يبقى مجاني', () => {
    const src = read('unlock-code-generator.tsx');

    // من غير ده، «مجاني» كان هيبقى اختيار مايقدرش حد يبعته.
    expect(src).toMatch(/isFree\s*\|\|\s*price\.kind\s*!==\s*'invalid'/);
  });

  it('الليستة بتسمّي الصف «مجاني» مش شرطة', () => {
    const src = read('page.tsx');

    expect(src).toContain('c.priceFree');
    // «—» كانت بتخلط المنحة بالسعر الناقص؛ مالهاش مكان في الخلية دي تاني.
    expect(src).not.toMatch(/cents === null \? <span className="text-fg-faint">—/);
  });
});
