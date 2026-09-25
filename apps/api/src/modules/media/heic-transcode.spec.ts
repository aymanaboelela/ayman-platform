import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * صورة الآيفون لازم توصل، وde تست بيقع على الكود اللي كان شغّال.
 *
 * ## اللي حصل
 *
 * `image/heic` على الـallowlist من زمان، فبيعدّي البوابتين — وبعدين `sharp`
 * مايعرفش يفتحه، فالرفع بيموت برسالة «file could not be processed as an
 * image». اتقاس على الـAPI الحي: HEIC ١٢٠٠×١٦٠٠ رد **400**، ونفس الصورة
 * PNG ردّت **201**.
 *
 * السبب فوقنا ومش بيتظبط بإعداد: النسخة المبنية مسبقًا من `sharp` بتيجي من
 * غير `libheif` عن قصد بسبب براءات HEVC.
 *
 * ## ⚠️ وليه التستات الموجودة كانت خضرا
 *
 * `media.service.spec.ts` فيه كيسين بيقولوا إن HEIC بيتقبل — بس البفر اللي
 * بيتبعت فيهم **PNG**، وخدمة التوقيع مزيّفة عشان تقول «ده heic». يعني هما
 * بيختبروا الـallowlist، و`sharp` عمره ما اتطلب منه يفكّ HEIC فعلي. التست ده
 * بيبعت **بايتات HEIC حقيقية**.
 */
const FIXTURE = join(__dirname, '__fixtures__', 'iphone-photo.heic');

describe('HEIC من تليفون', () => {
  const heic = readFileSync(FIXTURE);

  it('الفيكستشر نفسه HEIF حقيقي مش صورة متسمّية كده', () => {
    // `ftyp` في أول ٣٢ بايت + براند heic/mif1 — ده ISO-BMFF مش PNG.
    const head = heic.subarray(0, 32).toString('latin1');
    expect(head).toContain('ftyp');
    expect(/heic|heix|mif1|msf1/.test(head)).toBe(true);
  });

  /*
   * ⚠️ **مفيش تست هنا بيقول «sharp مايقدرش»، وde مقصود.**
   *
   * دعم HEIC في `sharp` بيتقرّر وقت البناء. على ماك التطوير `libvips` المحلي
   * بيفكّه، وفي صورة الإنتاج (Debian + النسخة المبنية مسبقًا) لأ. اتقاس:
   * `sharp(heic).metadata()` بتنجح على الجهاز ده، ونفس البايتات على الـAPI
   * الحي ردّت 400.
   *
   * فتست بيتأكد إن sharp بيفشل كان هيبقى أحمر محليًا وأخضر في الإنتاج —
   * بالظبط بالمقلوب. واللي بيتحرس بدلها إن **مسار التحويل بيشتغل في
   * الحالتين**، وده اللي الكود بيعمله: HEIC بيعدّي على ffmpeg دايمًا، مش لما
   * sharp يفشل.
   *
   * وده كمان بيفسّر ليه الباج عاش: محدش كان يقدر يشوفه على جهازه.
   */

  /*
   * ⚠️ العقد هنا هو **صورة الإنتاج**، مش الجهاز اللي التست ماشي عليه.
   *
   * أول نسخة كانت بتشغّل `ffmpeg -version` وتتأكد إنها ما ترميش. طلعت حمرا في
   * CI — الرَنر مالهوش ffmpeg — وخضرا محليًا وفي الصورة. يعني كانت بتقيس
   * البيئة مش الكود، وبتوقّع PR لسبب مالوش علاقة باللي اتغيّر.
   *
   * اللي لازم يفضل صح إن **الحاوية اللي الكود بيشتغل فيها** فيها ffmpeg،
   * وده سؤال عن ملف مش عن الجهاز الحالي. لو حد شال السطر ده من الـDockerfile
   * عشان يخفّف الصورة، التست ده بيقع — وده بالظبط اللحظة اللي المفروض نعرف
   * فيها.
   */
  it('صورة الإنتاج بتسطّب ffmpeg — ومن غيره الفيتشر ده مايشتغلش', () => {
    const dockerfile = readFileSync(join(__dirname, '..', '..', '..', 'Dockerfile'), 'utf8');
    const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));
    expect(runtime).toMatch(/apt-get install[^\n]*ffmpeg|install[^\n]*\bffmpeg\b/);
  });

  /*
   * بيتخطّى على جهاز مالهوش ffmpeg (رَنر CI) وبيشتغل على اللي عنده (التطوير،
   * وصورة الإنتاج). الكيس اللي فوق هو اللي بيحرس الاعتماد نفسه؛ ده بيحرس إن
   * الأوامر صح — والاتنين مع بعض بيغطّوا اللي كان بيتغطّى بواحد كان بيوقّع CI.
   */
  const hasFfmpeg = (() => {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  (hasFfmpeg ? it : it.skip)('وبعد ما يعدّي على ffmpeg، sharp بيفتحه ويطلّع WebP', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'heic-spec-'));
    try {
      const src = join(dir, 'in.heic');
      const out = join(dir, 'out.jpg');
      writeFileSync(src, heic);

      // ⚠️ ملف مش pipe: HEIF جواه صناديق الديموكسر بيعمل لها seek، فـ`pipe:0`
      // بيرجّع «Not yet implemented in FFmpeg» — وde بيتقري زي ملف باظ.
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
        '-i', src, '-frames:v', '1', '-q:v', '2', out], { stdio: 'ignore' });

      const jpeg = readFileSync(out);
      expect(jpeg[0]).toBe(0xff);
      expect(jpeg[1]).toBe(0xd8);

      const meta = await sharp(jpeg).metadata();
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(1600);

      const webp = await sharp(jpeg).webp().toBuffer();
      expect(webp.subarray(8, 12).toString('latin1')).toBe('WEBP');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
