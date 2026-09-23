/**
 * قفل السحب من يوتيوب مابيقفلش الرفع المباشر.
 *
 * الاتنين بيشاركوا نفس التخزين (`VIDEO_MIRROR_*`)، والطريقة «الطبيعية» لقفل
 * السحب — تفضية المتغيرات — كانت هتقفل الرفع معاه. وده بالظبط اللي صاحب
 * المنصة **مش** عايزه: هو بيرفع المحاضرة من لوحته، واللي وقف هو سحبها من
 * يوتيوب بعد ما يوتيوب بقى بيرد «Sign in to confirm you're not a bot» على
 * طلبات السيرفرات.
 *
 * التست ده بيقيس الأثر مش الآلية: `enabled` (اللي المشغّل ولوحة الأدمن
 * بيقروه عشان يعرفوا التخزين شغّال) لازم يفضل `true` والسحب مقفول.
 */
import { loadEnv } from '../../config/env';

const STORAGE = {
  VIDEO_MIRROR_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
  VIDEO_MIRROR_BUCKET: 'bucket',
  VIDEO_MIRROR_ACCESS_KEY_ID: 'id',
  VIDEO_MIRROR_SECRET_ACCESS_KEY: 'secret',
  VIDEO_ORIGIN: 'https://video.example.com',
  VIDEO_MIRROR_PUBLIC_URL: 'https://video.example.com',
};

/** الحد الأدنى اللي `loadEnv` بيرفض يقوم من غيره. */
const BASE = {
  API_PORT: '3300',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/d?schema=app',
  DIRECT_DATABASE_URL: 'postgresql://u:p@localhost:5432/d?schema=app',
  REDIS_URL: 'redis://localhost:6379',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  BETTER_AUTH_URL: 'https://example.com',
  APP_URL: 'https://example.com',
  MEDIA_BASE_URL: 'https://media.example.com/media',
  MEDIA_ROOT: '/tmp/media',
};

describe('VIDEO_MIRROR_FROM_YOUTUBE', () => {
  /*
   * The default used to be ON, «so no stack changes behaviour without a
   * decision». It is OFF now, and the reasons are two:
   *
   * 1. The decision exists — the platform owner asked for direct upload and
   *    said he does not want the YouTube pull.
   * 2. ON was not enabling a feature. All five clients answer «Sign in to
   *    confirm you're not a bot» from this server, so it was enabling a job
   *    that fails every minute and leaves half-written parts in the bucket.
   *
   * Turning it back on is one variable, and `VIDEO_MIRROR_COOKIES` is what
   * makes it succeed when it is.
   */
  it('defaults to OFF, because the pull cannot succeed from a data-centre IP', () => {
    expect(loadEnv({ ...BASE, ...STORAGE }).VIDEO_MIRROR_FROM_YOUTUBE).toBe(false);
  });

  it('still turns ON for a stack that asks for it', () => {
    const env = loadEnv({ ...BASE, ...STORAGE, VIDEO_MIRROR_FROM_YOUTUBE: 'true' });
    expect(env.VIDEO_MIRROR_FROM_YOUTUBE).toBe(true);
  });

  it('turns the pull off while the storage stays configured', () => {
    const env = loadEnv({ ...BASE, ...STORAGE, VIDEO_MIRROR_FROM_YOUTUBE: 'false' });

    expect(env.VIDEO_MIRROR_FROM_YOUTUBE).toBe(false);
    // ⚠️ دي هي النقطة: التخزين لسه مضبوط بالكامل، فالرفع المباشر شغّال.
    expect(env.VIDEO_MIRROR_BUCKET).toBe('bucket');
    expect(env.VIDEO_MIRROR_ACCESS_KEY_ID).toBe('id');
  });

  it('reads only the exact string, so a typo does not silently flip the pull', () => {
    expect(() => loadEnv({ ...BASE, ...STORAGE, VIDEO_MIRROR_FROM_YOUTUBE: 'no' })).toThrow();
    expect(() => loadEnv({ ...BASE, ...STORAGE, VIDEO_MIRROR_FROM_YOUTUBE: '0' })).toThrow();
  });
});
