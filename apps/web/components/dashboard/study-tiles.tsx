import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { Entitlements } from '@ayman/contracts/admin/entitlements';
import { STUDENT_NAV } from '@/components/app/student-nav-items';

/**
 * «المذاكرة والتحديات» on the dashboard — every study and challenge page this
 * stack has switched on, as a grid of coloured tiles.
 *
 * These were scattered across the page as their own cards («سؤال اليوم»,
 * «أوضة المذاكرة», the league…) or reachable only from the rail. One grid says
 * what exists and takes a tap to reach any of it. The list is the rail's own
 * table (`STUDENT_NAV`), filtered by the same entitlements the rail reads, so a
 * feature the owner opens for a teacher appears here and in the rail together.
 *
 * The hue is per POSITION, not per page: a fixed palette walked in order keeps
 * neighbours apart whatever subset a stack has on.
 */
const HUES = [35, 250, 295, 150, 75, 210, 340, 190, 20, 270, 120, 55] as const;

/**
 * Pages «النهارده» (`TodayStrip`) already draws as a row with today's state —
 * the streak, the plan's share, the league standing. A tile for each beside it
 * was the same door twice on one screen.
 */
const ON_TODAY_STRIP = new Set(['/daily', '/plan', '/focus', '/cards', '/league', '/badges']);

export function StudyTiles({ features, title }: { features: Entitlements; title: string }) {
  const items = STUDENT_NAV.filter(
    (item) =>
      (item.group === 'study' || item.group === 'play') &&
      !ON_TODAY_STRIP.has(item.href) &&
      (item.feature === undefined || features[item.feature]),
  );
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="study-tiles-title">
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 id="study-tiles-title" className="group-head__title">
          {title}
        </h2>
      </div>
      <ul className="study-tiles">
        {items.map((item, index) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="study-tile"
              style={{ '--tile-h': HUES[index % HUES.length] } as CSSProperties}
            >
              <span className="study-tile__disc" aria-hidden="true">
                <item.icon className="size-[18px]" />
              </span>
              <span className="study-tile__label">{item.labelAr}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
