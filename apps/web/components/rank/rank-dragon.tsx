import Image from 'next/image';
import type { RankLevelKey } from '@ayman/contracts/rank';
import { aymanOnly } from '@/lib/tenant';
import { LevelGem } from './rank-art';

/**
 * تنانين «ترتيبي» — الأول تنين كبير بينفخ نار، التاني أصغر، التالت أصغر
 * كمان، ومستوى «أسطورة» تنين مجنّح.
 *
 * ⚠️ لأيمن بس (`aymanOnly`). التنين شكل من هوية منصته (مشهد الصفحة الرئيسية
 * عنده)، والصفحة دي نفسها شغّالة عند كل المدرّسين. على أي ستاك تاني
 * `DRAGONS` بتبقى `undefined` والصفحة بترجع للتاج والجوهرة زي ما كانت —
 * نفس مسار الكود، من غير فرع تاني.
 *
 * الصور مقصوصة من صورة واحدة بعته (خلفيتها شفافة)، WebP، ومقاسها أكبر من
 * أكبر ظهور ليها بمرتين عشان شاشات الـRetina.
 */
const DRAGONS = aymanOnly({
  1: { src: '/rank/dragon-1.webp', width: 586, height: 560 },
  2: { src: '/rank/dragon-2.webp', width: 348, height: 400 },
  3: { src: '/rank/dragon-3.webp', width: 297, height: 320 },
} as const);

export const HAS_DRAGONS = DRAGONS !== undefined;

export function PodiumDragon({ place }: { place: 1 | 2 | 3 }) {
  if (!DRAGONS) return null;
  const dragon = DRAGONS[place];
  return (
    <Image
      className="rk-dragon"
      data-place={place}
      src={dragon.src}
      width={dragon.width}
      height={dragon.height}
      alt=""
      sizes="(min-width: 768px) 160px, 112px"
    />
  );
}

/** الجوهرة، إلا «أسطورة» عند أيمن: تنين مجنّح. */
export function LevelIcon({ level, className }: { level: RankLevelKey; className?: string }) {
  if (level === 'legend' && DRAGONS) {
    return (
      <Image
        className={['rk-dragon rk-dragon--level', className].filter(Boolean).join(' ')}
        src={DRAGONS[1].src}
        width={DRAGONS[1].width}
        height={DRAGONS[1].height}
        alt=""
        sizes="64px"
      />
    );
  }
  return <LevelGem level={level} className={className} />;
}
