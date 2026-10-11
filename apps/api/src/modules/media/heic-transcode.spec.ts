import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { heifTranscoder } from './heif-transcode';

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
 * غير فاك HEVC عن قصد بسبب البراءات.
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
   * ⚠️ «metadata() نجحت» مش معناها «sharp بيفك HEIC».
   *
   * أول إصلاح كان بيسأل `metadata()` ويعتبر النجاح فك. الـlibvips المبني
   * مسبقًا فيه libheif عشان AVIF ومن غير فاك HEVC، فالحاوية بتتقري والبكسلات
   * لأ — `metadata()` بترجع ١٢٠٠×١٦٠٠، وبعدها `toBuffer()` بتقع بـ«bad seek».
   * اتقاس على `node:24-slim` وعلى الماك، نفس sharp 0.35.3. فالبروب كان بيقول
   * «آه» والتحويل عمره ما اشتغل.
   *
   * لو يوم sharp بقى بيفك HEIC، التست ده بيقع — وde الوقت الصح نراجع فيه
   * الفولباك كله، مش نكتشفه من شكوى.
   */
  it('sharp المبني مسبقًا مابيفكّش بكسلات HEIC — حتى لو الهيدر اتقري', async () => {
    const decoded = await sharp(heic)
      .webp()
      .toBuffer()
      .then(() => true)
      .catch(() => false);
    expect(decoded).toBe(false);
  });

  /*
   * ⚠️ العقد هنا هو **صورة الإنتاج**، مش الجهاز اللي التست ماشي عليه.
   *
   * الرَنر في CI مالهوش ffmpeg ولا heif-convert، فتست بيشغّلهم هناك بيقيس
   * البيئة مش الكود. اللي لازم يفضل صح إن **الحاوية اللي الكود بيشتغل فيها**
   * فيها محوّل بيفهم HEIC — وde سؤال عن ملف.
   *
   * و`ffmpeg` لوحده مش كفاية: الصورة bookworm وffmpeg بتاعها 5.1 مابيقراش
   * HEIF أصلًا («moov atom not found»). ده اللي خلّى أول إصلاح (#443) يعدّي
   * تستاته — كانت بتتأكد من سطر ffmpeg — ويفضل كل HEIC بيترفض في الإنتاج.
   */
  it('صورة الإنتاج بتسطّب heif-convert — ffmpeg بتاع bookworm مابيقراش HEIF', () => {
    const dockerfile = readFileSync(join(__dirname, '..', '..', '..', 'Dockerfile'), 'utf8');
    const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));
    expect(runtime).toMatch(/apt-get install[^\n]*\blibheif-examples\b/);
    // الفيديو لسه محتاجه، والمحوّل بيرجعله لو heif-convert مش موجود.
    expect(runtime).toMatch(/apt-get install[^\n]*\bffmpeg\b/);
  });

  /*
   * بيتخطّى على جهاز مالهوش أي محوّل (رَنر CI) وبيشتغل على اللي عنده (الماك
   * بـffmpeg 8، وصورة الإنتاج بـheif-convert). بيعدّي على `heifTranscoder`
   * نفسه — نفس الأوامر اللي الإنتاج بيشغّلها، مش نسخة منها في التست.
   */
  const hasConverter = ['heif-convert', 'heif-dec', 'ffmpeg'].some((tool) => {
    try {
      execFileSync(tool, tool === 'ffmpeg' ? ['-version'] : ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });

  (hasConverter ? it : it.skip)('heifTranscoder بيطلّع JPEG بنفس المقاس، وsharp بيكمّل لـWebP', async () => {
    const jpeg = await heifTranscoder.toJpeg(heic);
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);

    const meta = await sharp(jpeg).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(1600);

    const webp = await sharp(jpeg).webp().toBuffer();
    expect(webp.subarray(8, 12).toString('latin1')).toBe('WEBP');
  });

  (hasConverter ? it : it.skip)('وبايتات مش HEIF بتترفض، مش بتطلّع صورة فاضية', async () => {
    await expect(heifTranscoder.toJpeg(Buffer.from('not a heif at all'))).rejects.toThrow();
  });
});
