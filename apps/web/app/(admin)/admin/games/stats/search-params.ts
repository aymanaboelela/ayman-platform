import { createSearchParamsCache, parseAsString, parseAsStringLiteral } from 'nuqs/server';
import { DEFAULT_VIDEO_PERIOD, VIDEO_PERIODS } from '@ayman/contracts/admin/video-analytics';

/**
 * «إحصائيات الألعاب». `period` بنفس اسم ونوع «الفيديوهات» عن قصد: الـ
 * `PeriodSwitcher` بتاعها بيتستخدم هنا زي ما هو (nuqs بيغيّر مفتاحه بس،
 * و`courseId` بيفضل في الرابط). فترة غلط في الرابط بترجع للافتراضي بدل ما
 * توصل للـAPI وترجّع 400.
 */
export const gameStatsSearchParams = {
  period: parseAsStringLiteral(VIDEO_PERIODS).withDefault(DEFAULT_VIDEO_PERIOD).withOptions({ shallow: false }),
  courseId: parseAsString.withDefault('').withOptions({ shallow: false }),
};
export const gameStatsCache = createSearchParamsCache(gameStatsSearchParams);
