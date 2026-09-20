import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_KEYS } from '@ayman/contracts/admin/entitlements';

/**
 * كل مفتاح في الكتالوج بيقفل حاجة فعلًا — مافيش مفتاح ديكور.
 *
 * ## ليه ده تست وليه هو مش تست للجارد
 *
 * `feature.guard.spec.ts` بيثبت إن الجارد بيرد ٤٠٤ لما الفيتشر مقفولة، وده
 * صح وكافي **للجارد**. بس المفتاح اللي مالوش ولا `@RequireFeature` ولا
 * `isFeatureEnabled` في أي مكان بيعدّي من التست ده وهو ساكت: بيبان في شاشة
 * التحكّم، أيمن بيشيل العلامة، التوكن بيتوقّع صح، الستاك بيقراه صح — وبعدين
 * الفيتشر شغّالة زي ما هي.
 *
 * ده الشكل بالحرف اللي CLAUDE.md §٢ قاعدة ٣ بتحكيه، و«تست بيأكد الآلية مش
 * الأثر» اللي الريبو اتلسع منه أكتر من مرة. فالتست ده بيقيس الحاجة الوحيدة
 * اللي مفيش تست تاني بيشوفها: إن المفتاح مربوط بكود.
 *
 * ⚠️ بيدوّر في `apps/api` بس، عن قصد. الويب بيخفي، والـAPI بيقفل — ومفتاح
 * متجيّت في الويب لوحده هو بالظبط «مخفي وشغّال لأي حد يعرف الـURL».
 */

const API_SRC = join(__dirname, '..');

/** كل `.ts` تحت `apps/api/src` ما عدا التستات نفسها والكود المولّد. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // `generated` فيها كلاينت Prisma — ميجا بايتات مالهاش علاقة بالسؤال ده.
      if (entry.name === 'generated' || entry.name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !/\.(spec|int-spec)\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * البابين اللي بيقفلوا فيتشر في الـAPI: الديكوريتر على راوت أو كونترولر،
 * والقراءة الـsync جوّه سيرفيس (زي `courseBook` و`player.service`).
 *
 * كوتيشن مفردة بس، لأن ده اللي الريبو كله ماشي عليه (CLAUDE.md §٧) — ولو
 * حد كتب دبل، التست ده هو اللي هيبان فيه.
 */
const USAGE = /(?:RequireFeature|isFeatureEnabled)\('([^']+)'\)/g;

/**
 * سطر كومنت مش استخدام.
 *
 * ⚠️ ده مش تزويق: `require-feature.decorator.ts` مكتوب في الدوكبلوك بتاعه
 * `@RequireFeature('bokks')` كمثال على الغلطة الإملائية اللي التايب بيمسكها،
 * والنسخة الأولانية من التست ده اعتبرتها مفتاح حقيقي ووقعت عليها.
 *
 * السطر بيتفلتر مش الملف: فلترة الملف كانت هتعمي التست عن أي جيت حقيقي
 * يتكتب فيه بعدين.
 */
function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
}

describe('the feature catalogue is wired to the API', () => {
  const used = new Set<string>();
  for (const file of sourceFiles(API_SRC)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (isComment(line)) continue;
      for (const match of line.matchAll(USAGE)) used.add(match[1]!);
    }
  }

  it.each([...FEATURE_KEYS])('«%s» is enforced somewhere in apps/api', (key) => {
    expect(used.has(key)).toBe(true);
  });

  /**
   * والاتجاه التاني: مفتاح اتشال من الكتالوج وفضل مكتوب في جارد.
   *
   * التايب بيمسك ده وقت الكومبايل، فالتست هنا مش تكرار — هو اللي بيمسكه في
   * سترنج جوّه ملف مش داخل في `tsc` (سكريبت، أو ملف اتنسي في `exclude`).
   */
  it('names no key the catalogue does not declare', () => {
    expect([...used].filter((key) => !FEATURE_KEYS.includes(key as never))).toEqual([]);
  });
});
